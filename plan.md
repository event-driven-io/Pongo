# Plan: statement timeouts and session forwarding (issue #219)

## Goal

1. Fix #219: every collection operation runs on the session's transaction when a `session` is passed.
2. Let callers set a statement timeout per collection operation and per transaction, on Dumbo (`timeoutMs`, `abort`, `statementTimeoutMs`) and Pongo (`maxTimeMS` following Mongo naming, `abort` as in Dumbo; the Mongo shim takes `signal` and wraps it into `abort`).
3. Make Dumbo's pg `timeoutMs` stop leaking `statement_timeout` onto pooled connections.

## Facts this plan relies on

- pg `batchQuery`/`batchCommand` run `SET statement_timeout = N` and never undo it (`src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts:106-108`, `:153-155`). The setting stays on that connection. Migrations take the advisory lock with a default `timeoutMs: 10000` (`src/packages/dumbo/src/core/locks/databaseLock.ts:15`, `src/packages/dumbo/src/storage/postgresql/core/locks/advisoryLocks.ts:22-31`), so the rest of the migration runs under 10s and the connection keeps 10s after commit.
- Collection helpers `query`/`command` pass only `columnMapping` to Dumbo (`src/packages/pongo/src/core/collection/pongoCollection.ts:134-149`).
- `find` (`:913-917`), `fetchByIds` (`:246`), `countDocuments` (`:929`) and `drop` (`:935`) don't pass `options` to `query`/`command`, so `session` is ignored.
- `pongoTransaction.enlistDatabase` calls `db.transaction()` without options (`src/packages/pongo/src/core/pongoTransaction.ts`). `db.transaction(options)` already forwards options to Dumbo.
- pg transaction `begin` builds the `BEGIN` statement (`src/packages/dumbo/src/storage/postgresql/pg/connections/transaction.ts:45-54`). Nested transactions use savepoints, not `begin`.
- SQLite, D1 and Durable Objects ignore `timeoutMs`.

## Design

- **Per-call timeout (pg):**
  - `SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', 'N', false)` in one round trip, run the statements, then restore with `SELECT set_config('statement_timeout', '<shown value>', false)`. Values are inlined as escaped literals. Same code inside and outside transactions.
  - A failed set goes through the same error mapping and tracing as a failed statement; nothing else is sent.
  - A failed restore in an aborted transaction is swallowed; the rollback undoes it anyway, and the statement's error surfaces.
  - For a SQL with several statements, the executor returns the last statement's result, and `assertChanges` checks its `rowCount`.
  - Set, statements and restore are separate round trips, so calls sharing one client (a single `pg.Client`, or `Promise.all` inside a transaction) must run one at a time. Step 3 documents this.
- **Transaction timeout (pg):** `statementTimeoutMs` on `DatabaseTransactionOptions`. It limits each statement in the transaction, not the whole transaction.
  - `begin` rejects a `statementTimeoutMs` that isn't an integer in 1..2147483647 with `InvalidOperationError` before sending anything. `0` means no timeout.
  - `begin` runs `BEGIN ...; SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', 'N', true)` in one round trip and keeps the shown value.
  - `BEGIN` and `COMMIT` go through the pg executor, so they are traced and their errors are mapped to Dumbo errors.
  - Inside the transaction, a per-call restore can turn the local value into a session setting. So `commit` runs `COMMIT; SELECT set_config('statement_timeout', '<shown value>', false)` in one round trip, putting the connection's previous value back. The value is inlined as an escaped literal because a parameterized query allows only one statement.
  - `COMMIT` goes first because in an aborted transaction any other statement fails and `COMMIT` would never run, returning the connection to the pool mid-transaction. On an aborted transaction `COMMIT` acts as `ROLLBACK`, which restores the value.
  - `rollback` needs nothing: Postgres undoes every `SET` made in the transaction. A failed `COMMIT` rolls back too, skips the `set_config` and throws the mapped Dumbo error (e.g. `UniqueConstraintError`).
  - Without `statementTimeoutMs`, `begin` and `commit` stay as they are.
  - Nested transactions don't call `begin`, so the outermost value applies.
- **Pongo operations:**
  - `maxTimeMS?: number` and `abort?: Abort` go on `CollectionOperationOptions`, with no `mapping`.
  - The helpers pass `{ timeoutMs: maxTimeMS, abort, ...columnMapping }`.
  - The Mongo shim accepts Mongo's `maxTimeMS` and `signal?: AbortSignal` and passes them to Pongo as `maxTimeMS` and `abort: { signal }`.
  - `collection.sql.query`/`command` get the same options.
- **Pongo transactions:** `maxTimeMS` on `PongoTransactionOptions`, passed as `statementTimeoutMs` to `db.transaction(...)` in `enlistDatabase`.
- **`ensureMigrated`:** the operation's `maxTimeMS` also applies to the migration it runs, passed as `migrationTimeoutMs`.

## Order

- **Step 1** (Dumbo pg timeouts) and **Step 2** (#219 in Pongo) are independent. They share one workspace, and Pongo tests run against Dumbo's `dist`, so a mid-change Dumbo build breaks Step 2's test runs. Run them sequentially.
- **Step 3** (Pongo timeouts and docs) after Steps 1 and 2.

## How each step runs

Each step is a list of red-green cycles. Per cycle:

1. Write the cycle's tests.
2. Run them; they fail for the stated reason. A cycle marked "guard" pins today's behavior and passes immediately.
3. Write the minimal code to make them pass.
4. Run them green, refactor, and keep the build green (`npm run build:ts`).

## Verification after each step (from `src`)

1. `npm run build:ts` (Pongo specs import Dumbo from `dist`)
2. `npm run agent:check`
3. The step's own test files
4. `npm run test:unit`

Fix every failure before the next step. `npm test` before handoff.

---

## Step 1: pg statement timeouts in Dumbo (per call and per transaction)

```text
Context: Pongo repo, npm workspaces under src/. Run commands from src. Module pattern (functions, closures), no classes, no monkey-patching or module mocking; fakes are plain objects passed in. Vitest; name tests after observable behavior. TDD in red-green cycles: per cycle write the tests, run them and see them fail for the stated reason, write the minimal code, run them green, refactor, run npm run build:ts.

Problem:
- src/packages/dumbo/src/storage/postgresql/pg/execute/execute.ts runs `SET statement_timeout = ${timeoutMs}` in batchQuery (~106-108) and batchCommand (~153-155) and never restores it, so the setting stays on the pooled connection. Migrations hit this through advisory locks (default timeoutMs 10000).
- Transactions have no statement timeout option.

Target behavior:
- Per call: `SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', 'N', false)` with inlined literals, run the statements, then in finally restore with `SELECT set_config('statement_timeout', '<shown value>', false)`. If the restore fails (aborted transaction), swallow it; the original error always surfaces. A failed set goes through the same tracer.error + mapPostgresError as a failed statement, and nothing else is sent. Without timeoutMs nothing extra is sent.
- Per transaction: `statementTimeoutMs?: number` on DatabaseTransactionOptions (src/packages/dumbo/src/core/connections/transaction.ts). In src/packages/dumbo/src/storage/postgresql/pg/connections/transaction.ts:
  - begin rejects a statementTimeoutMs that isn't an integer in 1..2147483647 with InvalidOperationError before sending anything.
  - begin sends `BEGIN ...; SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', 'N', true)` as one query through the executor and keeps the shown value in the closure. The executor returns the last statement's result.
  - commit sends `COMMIT; SELECT set_config('statement_timeout', '<kept value, single quotes doubled>', false)` as one query. COMMIT goes first so an aborted transaction still ends. The set_config undoes a per-call restore that turned the local value into a session setting.
  - rollback stays unchanged: Postgres undoes every SET made in the transaction.
  - Without statementTimeoutMs, begin and commit stay unchanged. Nested transactions don't call begin, so the outermost value applies.
  - No changes to pgSQLExecutor's signature and no flags. SQLite/D1 ignore the option.

Unit tests use a fake client: a plain object whose query records each call and returns canned results (SHOW returns [{ rowCount, rows: [{ statement_timeout: '5s' }] }, ...]). Wire it with sqlExecutor(pgSQLExecutor({ serializer }), { connect: () => Promise.resolve(fakeClient) }) and pgTransaction(...)({ client: Promise.resolve(fakeClient), options, ... }).
Integration tests use Testcontainers PostgreSQL in the setup style of pg/execute/errorMapper.int.spec.ts, with a Dumbo pg pool limited to one connection so every call reuses it, and a known session value set first with `SET statement_timeout = '5s'`.

Cycle 1 (unit, guard), new pg/execute/execute.unit.spec.ts: query, batchQuery, command and batchCommand without timeoutMs send only their statements.

Cycle 2 (unit), same file: with timeoutMs, each of the four sends the current_setting/set_config query first, then the statements, then set_config with the shown value. When a statement fails and the restore fails too, the statement's mapped error is thrown and the restore error is swallowed. When the set fails, its mapped error is thrown and nothing else is sent. A SQL with several statements returns the last statement's result, and assertChanges checks the last statement's rowCount.
Red because: today it sends a plain SET and never restores.

Cycle 3 (integration), new pg/execute/statementTimeout.int.spec.ts:
- query, batchQuery, command, batchCommand with timeoutMs succeed and SHOW statement_timeout returns 5s afterwards
- a statement exceeding timeoutMs throws QueryCanceledError and SHOW returns 5s afterwards
- with no previous SET, the value after a call is '0'
Plus, in src/packages/dumbo/src/storage/postgresql/core/schema/migrations.int.spec.ts:
- after migrations run, statement_timeout on the connection is unchanged
- with lock options { timeoutMs: 300 }, a migration running `SELECT pg_sleep(0.5)` succeeds
Red because: the SET leaks. Cycle 2's code should turn them green; if not, fix before moving on.

Cycle 4 (unit, guard), new pg/connections/transaction.unit.spec.ts: a transaction without statementTimeoutMs sends `BEGIN` / `COMMIT` / `ROLLBACK` exactly as today, including isolation level and READ ONLY.

Cycle 5 (unit), same file: with statementTimeoutMs: 50, begin sends `BEGIN; SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', '50', true)`, commit sends `COMMIT; SELECT set_config('statement_timeout', '5s', false)`, rollback sends `ROLLBACK`. A shown value containing a single quote is sent with it doubled. statementTimeoutMs -1, 1.5, NaN and 2147483648 make begin throw without sending anything.
Red because: the option doesn't exist.

Cycle 6 (integration), new pg/connections/transactionStatementTimeout.int.spec.ts:
- withTransaction({ statementTimeoutMs: 50 }) with `SELECT pg_sleep(0.2)` throws QueryCanceledError; afterwards SHOW returns 5s
- a committed transaction with statementTimeoutMs leaves 5s
- inside withTransaction({ statementTimeoutMs: 50 }), a query with timeoutMs: 1000 on pg_sleep(0.2) succeeds, the next pg_sleep(0.2) is cancelled at 50ms, and after the transaction ends SHOW returns 5s; cover both commit and rollback
- a failing COMMIT (deferred unique constraint violated in the transaction) throws UniqueConstraintError and leaves 5s
- a handler that catches a failed statement (`SELECT 1/0`) and returns normally leaves a usable connection and 5s
- withTransaction({ statementTimeoutMs: -1 }) throws and the next pool query succeeds
- a nested transaction (allowNestedTransactions, with and without useSavepoints) passing a different statementTimeoutMs doesn't change the outer transaction's timeout
- a nested transaction with useSavepoints that fails on a per-call timeoutMs rolls back to its savepoint, keeps the outer transaction's timeout, and SHOW returns 5s after the outer commit
Red only if cycle 5's code misses a case; the commit-after-per-call case proves the leak fix.

Verify from src: npm run build:ts, npm run agent:check, the new and changed spec files, npm run test:unit. All green, output clean.
```

## Step 2: #219, collection operations run on the session's transaction

```text
Context: same repo and rules. In src/packages/pongo/src/core/collection/pongoCollection.ts the helpers `query(sql, options)` and `command(sql, options)` pick the session's transaction executor from options.session. Four call sites don't pass options, so the statement runs on a separate pool connection outside the session's transaction:
- find: query(SqlFor.find(filter ?? {}, options)) around line 913
- fetchByIds (used by find with an id-only filter and by handle): around line 246
- countDocuments: query(SqlFor.countDocuments(filter ?? {})) around line 929
- drop: command(SqlFor.drop()) around line 935

One cycle: write the unit and e2e tests below, run them, see them fail, then fix.

Unit, src/packages/pongo/src/core/database/pongoDb.unit.spec.ts. No module mocking: extend createTestDb so pool.transaction returns a fake transaction, a plain object with no-op begin/commit/rollback and its own execute (query, batchQuery, command, batchCommand) that records every call with its options, separate from pool.execute. Pongo reaches it through db.transaction() in pongoTransaction.enlistDatabase and transactionExecutorOrDefault uses its execute.
- find (non-id filter), find (id-only filter with skipCache), countDocuments, handle and drop with { session } inside a started transaction run on the transaction's execute and never on pool.execute

E2e, next to "should delete documents in transaction" in each of:
- src/packages/pongo/src/e2e/postgresql/pg/postgres.e2e.spec.ts
- src/packages/pongo/src/e2e/sqlite/sqlite3/sqlite3.e2e.spec.ts
- src/packages/pongo/src/e2e/sqlite/d1/d1.e2e.spec.ts
- src/packages/pongo/src/e2e/sqlite/durableObject/durableObject.e2e.spec.ts
Inside a session transaction, after inserting documents with { session }:
- find with a non-id filter (e.g. { age: { $gte: 40 } }) and { session } returns the uncommitted documents
- find with an id-only filter and { session, skipCache: true } returns them
- countDocuments(filter, { session }) counts them
- handle on an uncommitted document with { session } sees it
- drop({ session }) followed by abortTransaction leaves the collection and its documents in place

Red because: these calls run outside the transaction. Build Dumbo first (npm run build:ts).
Implementation: pass `options` as the second argument at the four call sites. Nothing else.

Verify from src: npm run build:ts, npm run agent:check, the four e2e files and the unit spec, npm run test:unit.
```

## Step 3: timeouts in Pongo (per operation and per transaction), plus docs

```text
Context: same repo and rules. Step 1 is done: Dumbo pg timeoutMs restores the previous statement_timeout, and Dumbo transactions accept statementTimeoutMs. Step 2 is done: every collection operation forwards options to the internal query/command helpers.

Naming: flat fields on the operation options. `maxTimeMS` for the server-side time limit, following the MongoDB Node driver. Core Pongo uses Dumbo's `abort?: Abort` (`{ signal: AbortSignal }`). The Mongo shim (src/packages/pongo/src/mongo) accepts Mongo's `signal?: AbortSignal` and wraps it as `abort: { signal }`.

The workspace has partial, uncommitted changes from an interrupted earlier attempt that used `timeoutMs`/`abort` on CollectionOperationOptions and `statementTimeoutMs` on PongoTransactionOptions (operations.ts, pongoCollection.ts, pongoTransaction.ts, possibly pongoDb.unit.spec.ts, the e2e specs and src/docs/getting-started.md). Rework them to the names below; don't leave the old names anywhere. Don't touch the Step 2 changes or the D1 changes in src/packages/dumbo/src/storage/sqlite/d1/execute/.

Target behavior:
- `maxTimeMS?: number` and `abort?: Abort` directly on CollectionOperationOptions in src/packages/pongo/src/core/typing/operations.ts, so every per-operation options type inherits them; collection.sql.query/command accept the same. mapping is NOT exposed.
- pongoCollection.ts helpers pass `{ timeoutMs: options?.maxTimeMS, abort: options?.abort, ...columnMapping }` to Dumbo; pick fields explicitly, don't spread options.
- Mongo shim (src/packages/pongo/src/mongo): collection operations accept Mongo's `maxTimeMS` and `signal` and pass them to Pongo as `maxTimeMS` and `abort: { signal }`; transaction options' `maxTimeMS` reaches Pongo's transaction options.
- ensureMigrated passes `migrationTimeoutMs: options?.maxTimeMS` to db.schema.migrate.
- Sessions, matching Mongo's `startSession(options?: ClientSessionOptions)` and `withSession(options, executor)` overload: PongoClient.startSession accepts optional `{ defaultTransactionOptions?: PongoTransactionOptions }` and withSession gets the `(options, callback)` overload; both forward to pongoSession, which already reads `options.defaultTransactionOptions` (src/packages/pongo/src/core/pongoSession.ts:36). The Mongo shim's startSession/withSession pass `defaultTransactionOptions` through (src/packages/pongo/src/mongo/mongoClient.ts:90 ignores its options today). Tests: a session started with `{ defaultTransactionOptions: { maxTimeMS } }` passes it to pool.transaction as statementTimeoutMs (unit), and a pg_sleep find in such a session's transaction times out (postgres e2e, and through the shim).
- `maxTimeMS?: number` on PongoTransactionOptions (next to maxCommitTimeMS); pongoTransaction.enlistDatabase (src/packages/pongo/src/core/pongoTransaction.ts) calls db.transaction({ statementTimeoutMs: options.maxTimeMS }). db.transaction(options) already forwards to Dumbo.

Cycle 1 (unit), src/packages/pongo/src/core/database/pongoDb.unit.spec.ts, recording options in createTestDb's pool.execute stub and in the fake transaction's execute from Step 2:
- find, findOne, insertOne, updateOne, deleteOne, countDocuments and collection.sql.query/command pass maxTimeMS as timeoutMs and abort to the executor, without a session (pool.execute) and with { session } (the transaction's execute)
- the options still contain Pongo's mapping for `data` and `_version`
- session, skipCache, upsert and expectedVersion don't reach the executor
- the first operation on a new collection with maxTimeMS passes it to the migration as migrationTimeoutMs
- a transaction started with maxTimeMS passes it to pool.transaction as statementTimeoutMs
Red because: the options don't exist.

Cycle 2 (e2e), src/packages/pongo/src/e2e/postgresql/pg/postgres.e2e.spec.ts:
- find(SQL`pg_sleep(0.2) IS NOT NULL`, { maxTimeMS: 50 }) throws a statement-timeout error, without a session and with { session } in a transaction; a following find on the same client without maxTimeMS succeeds
- an operation with an already aborted abort.signal rejects before running
- through the Mongo shim: collection find with { maxTimeMS: 50 } on pg_sleep(0.2) throws a statement-timeout error, and an operation with an already aborted signal rejects before running (put these in the existing shim e2e/spec that covers Postgres; find it)
- session.startTransaction({ maxTimeMS: 50 }) and session.withTransaction(fn, { maxTimeMS: 50 }): find on pg_sleep(0.2) with { session } throws a statement-timeout error; with { session, maxTimeMS: 1000 } it succeeds
- after such a transaction commits, and after abortTransaction, a find without session or maxTimeMS on pg_sleep(0.2) succeeds
In the sqlite3, d1 and durableObject e2e specs: operations and transactions with maxTimeMS succeed (ignored).
Red because: cycle 1 only covered forwarding; these prove end-to-end behavior. If they're green right after cycle 1, keep them as guards.

Cycle 3 (docs): find where Pongo documents collection operation options, sessions and transactions (src/docs, package READMEs, samples). Review whatever the interrupted attempt wrote in src/docs/getting-started.md. Document:
- maxTimeMS and abort on collection operations and collection.sql; maxTimeMS and signal through the Mongo shim
- maxTimeMS on Pongo transactions (startTransaction/withTransaction) and statementTimeoutMs on Dumbo transactions (withTransaction/transaction)
- timeouts limit each statement, not the whole operation or transaction
- PostgreSQL only; SQLite, D1 and Durable Objects ignore maxTimeMS
- abort/signal is checked before connecting and does not cancel a running statement
- 0 or unset means no timeout; values must be integers in 1..2147483647
- per-call maxTimeMS runs set, statement and restore as separate round trips, so concurrent calls on one shared client (a single pg.Client, or Promise.all inside a transaction) can apply the wrong timeout; run them one at a time
Follow the existing docs style; no negative "There is no X" phrasing; one line per Markdown paragraph. If no docs cover these options yet, add the smallest fitting section and say where. Run npm run docs:build.

Verify from src: npm run build:ts, npm run agent:check, the changed specs, npm run test:unit, npm run docs:build, then npm test. Everything green, output clean. Report the commands and results.
```
