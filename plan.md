# Cloudflare Durable Object SQLite Driver Plan

## Goal

Add Cloudflare SQLite-backed Durable Object SQL storage support to Dumbo first, then wire it into Pongo as a Cloudflare SQLite driver alongside the existing D1 support.

## Current Codebase Shape

Dumbo already has the right layering:

- `src/packages/dumbo/src/storage/sqlite/core`: shared SQLite schema, formatting, metadata, connection abstractions, and generic SQLite transaction helpers.
- `src/packages/dumbo/src/storage/sqlite/sqlite3`: Node `sqlite3` adapter over the shared SQLite core.
- `src/packages/dumbo/src/storage/sqlite/d1`: Cloudflare D1 adapter over the shared SQLite core.
- `src/packages/dumbo/src/cloudflare.ts`: Cloudflare-facing exports, currently shared SQLite core plus D1.

Pongo is similarly thin:

- `src/packages/pongo/src/storage/sqlite/d1`: Pongo driver wrapper around Dumbo D1.
- `src/packages/pongo/src/cloudflare.ts`: Cloudflare-facing Pongo exports.
- `src/packages/pongo/src/index.ts`: lazy driver registration for `SQLite:d1`.

## Cloudflare Durable Object SQLite Specifics

Research source: https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/

Key constraints for this adapter:

- SQLite-backed Durable Objects expose SQL through `ctx.storage.sql`.
- `ctx.storage.sql.exec(query, ...bindings)` is synchronous and returns a `SqlStorageCursor`.
- The cursor is iterable, has `.toArray()`, `.one()`, `.raw()`, `.columnNames`, `.rowsRead`, and `.rowsWritten`.
- Multiple SQL statements may be passed to `exec()`, but bindings apply only to the last statement, and the returned cursor represents only the last statement.
- Cursors should be fully consumed synchronously before an `await`; the driver should call `.toArray()` immediately.
- `exec()` cannot run transaction-control SQL such as `BEGIN`, `COMMIT`, `ROLLBACK`, or `SAVEPOINT`.
- SQLite-backed Durable Objects provide `ctx.storage.transactionSync(callback)`, intended for synchronous SQL work.
- The async `ctx.storage.transaction(callback)` exists, but for SQLite-backed storage the transaction object is obsolete and SQL calls on `ctx.storage.sql` participate directly in the transaction.
- Durable Object storage is private to one Durable Object instance and only available from within a Durable Object.
- Local development and tests can use Miniflare or Cloudflare Workers Vitest integration. Existing repo D1 tests use Miniflare, so start there unless local DO SQLite support requires `@cloudflare/vitest-plugin`.

Local typings confirm:

- `DurableObjectStorage.sql: SqlStorage`
- `DurableObjectStorage.transactionSync<T>(closure: () => T): T`
- `SqlStorage.exec<T>(query: string, ...bindings: any[]): SqlStorageCursor<T>`
- `SqlStorageCursor.rowsRead`, `rowsWritten`, `columnNames`, `toArray()`, `one()`, `raw()`

Miniflare PoC result:

- A throwaway Miniflare SQLite-backed Durable Object test confirmed that `ctx.storage.transaction(async () => { ... })` rolls back `ctx.storage.sql.exec(...)` writes made before and after `await Promise.resolve()` when the callback throws.
- The same test confirmed that writes before and after `await Promise.resolve()` commit when the async transaction callback returns successfully.
- This validates preserving Dumbo's async transaction callback shape for this driver by using `DurableObjectStorage.transaction(async () => userCallback(tx))`.
- The PoC only tested a microtask await, not external I/O such as `fetch()` or timers. Transaction callbacks should still avoid long external async work because they hold the Durable Object transaction open and can affect throughput/runtime limits.

## Target Design

Use a new Dumbo adapter under:

`src/packages/dumbo/src/storage/sqlite/durableObject`

Public names:

- Driver type: `Cloudflare:durableObjectSQLite`
- Client: `cloudflareDurableObjectSQLiteClient`
- Connection: `cloudflareDurableObjectSQLiteConnection`
- Pool: `cloudflareDurableObjectSQLitePool`
- Dumbo driver: `cloudflareDurableObjectSQLiteDumboDriver`
- Pongo driver: `cloudflareDurableObjectSQLiteDriver` and exported alias `pongoDriver` only from a dedicated module if needed.

The adapter should accept an ambient `DurableObjectStorage` or `SqlStorage`, because Durable Object SQLite cannot be opened from outside a Durable Object like a normal database. The pool should be a singleton/ambient pool, similar to D1, but the required option should be `storage` or `sql`.

Recommended options:

```ts
type DurableObjectSQLiteClientOptions = {
  storage?: DurableObjectStorage;
  sql?: SqlStorage;
  serializer: JSONSerializer;
};
```

Prefer accepting `storage` as the primary public option. In normal Cloudflare Durable Object code, users have `ctx.storage`, and SQL is available at `ctx.storage.sql`. Accepting raw `sql` is useful for tests and advanced embedding, but raw `SqlStorage` alone does not expose `transaction`, so it cannot support Dumbo/Pongo transaction APIs. If both are supplied, choose `sql` deterministically and document it in tests.

Agreed transaction design:

- Keep Dumbo and Pongo public APIs async. Do not add a public sync transaction API for this driver.
- Use `storage.transaction(async () => userCallback(tx))` for Dumbo `withTransaction`.
- Do not use `storage.transactionSync()` in this driver implementation. The PoC validated async `storage.transaction(async () => ...)`, and existing Dumbo/Pongo callers rely on async callbacks. Mixing in sync transaction execution would create a second transaction model inside a unified async driver.
- Adapter-owned atomic operations such as `batchCommand` should also use async `storage.transaction(async () => ...)` when full `storage` is available. This keeps one transaction path for the driver and matches the PoC-backed design.
- Do not emit SQL transaction statements through `sql.exec()`.
- Inside every query/command method, call `sql.exec(...)` and immediately consume the cursor with `.toArray()` before any `await`.
- Transactions require full `storage: ctx.storage`. Passing only `sql: ctx.storage.sql` can support query/command execution but cannot support `withTransaction`, because the transaction API lives on `DurableObjectStorage`.

## Implementation Discipline And Definition Of Done

Build this test-first. Tests must describe supported behavior, not implementation scaffolding. Do not add tests whose main purpose is to assert that placeholders, skeletons, or unimplemented stubs exist. There is no manual user-review gate in the implementation plan itself; user review can happen outside the plan workflow, but it is not a completion condition for a prompt. Completion is gated by automated quality checks, mandatory self-review, and explicit blocker documentation only.

For every implementation prompt:

1. Identify the closest existing driver tests before editing implementation code, usually D1 first and sqlite3 second.
2. Add or adapt the relevant tests for Durable Object SQLite first. The new driver should have the same class of tests as the comparable D1/sqlite3 behavior it implements:
   - client execution tests for query, command, batch query, batch command, returned rows, affected row counts, and assert-changes behavior;
   - connection and pool tests for ambient handles, singleton behavior, and missing-option errors;
   - transaction tests for callback result propagation, rollback/error propagation, nested behavior, and proof that transaction-control SQL is not emitted;
   - driver registration/type/export tests matching D1;
   - runtime integration tests with Miniflare for the Cloudflare-specific SQLite-backed Durable Object behavior;
   - Pongo wrapper, connection, transaction, and e2e tests mirroring D1 where the runtime harness supports it.
3. Only then implement the smallest production code needed to make those tests pass.
4. Run `npm run fix` from `src` before final verification for each prompt that changes TypeScript or Markdown.
5. Run at least the relevant unit tests and integration tests for the touched area. If a prompt appears to be type-only or skeleton-only, do not add scaffolding tests to make it look covered. Either narrow/remove the exposed code until a behavioral phase needs it, or turn the phase into a real vertical slice with behavior and tests. If no integration test can apply yet, document the reason in `todo.md`; do not silently mark it complete.
6. Run the package TypeScript build for the affected package.
7. Do not mark a prompt complete in `todo.md` until tests, lint/fix, and build have passed. If a required integration test cannot run because of a real environment/tooling limitation, document the blocker in `todo.md` and leave that prompt or verification item incomplete rather than treating it as done.

After each phase, run a mandatory self-review before marking the phase complete. This review is a hard gate. If any item fails, fix it before marking the phase complete or leave the phase incomplete with the reason in `todo.md`:

- No `storage.transactionSync()` usage in the Durable Object SQLite driver.
- No transaction-control SQL emitted through `ctx.storage.sql.exec()`.
- Dumbo and Pongo public APIs remain async; synchronous Cloudflare `SqlStorage.exec()` is consumed internally and immediately.
- Tests are colocated in the same structure as D1/sqlite3 unless a documented Durable Object-specific reason exists.
- No top-level catch-all skeleton/harness tests.
- No redundant abstractions, monkey patching, or hacks.
- No skeleton/stub tests used as a substitute for real behavior tests.
- No tests that assert implementation details instead of how the driver should work.
- No untested production behavior exposed by the phase; either add matching behavioral tests or narrow/remove the exposed behavior.
- Durable Object-specific added/dropped cases are recorded in `plan.md` or `todo.md`.

## Dumbo Implementation Blueprint

1. Add the Durable Object SQLite folder structure.
2. Define driver/client/connection/pool types with no runtime behavior beyond simple construction.
3. Implement a client around `SqlStorage.exec()`.
4. Reuse `sqliteFormatter` for SQL and binding generation.
5. Convert every cursor to rows immediately with `.toArray()`.
6. For `query` and `batchQuery`, return `{ rowCount: rows.length, rows }`.
7. For `command`, return `{ rowCount: cursor.rowsWritten, rows }` after consuming rows. This supports `RETURNING` rows while using Cloudflare's write count when available.
8. For `batchCommand`, execute statements sequentially inside async `storage.transaction(async () => ...)` when `storage` is available. If only `sql` is available, execute sequentially and document that atomic batch command requires `storage`.
9. Support `assertChanges` the same way as D1/sqlite3 by throwing `BatchCommandNoChangesError(statementIndex)` when a batch command reports zero writes.
10. Implement Dumbo transactions with `storage.transaction(async () => ...)`, not SQL transaction statements.
11. Disallow savepoint semantics for this driver unless a safe nested transaction behavior is verified. Initial nested support should mirror D1's counter-only behavior, or reject explicit savepoint use.
12. Reuse `sqliteAmbientClientConnection` where possible, but override `initTransaction` with a Durable Object specific transaction factory.
13. Reuse `sqliteSQLExecutor` with a Durable Object specific error mapper if needed. Start with `mapSqliteError` unless tests show Cloudflare throws distinct error shapes.
14. Add `cloudflareDurableObjectSQLiteDumboDriver` using shared `sqliteFormatter`, `sqliteMetadata`, and `DefaultSQLiteMigratorOptions`.
15. Export from `src/packages/dumbo/src/cloudflare.ts`.
16. Add the driver to public type exports only through the existing `cloudflare` package entry point.

## Dumbo Test Blueprint

Start with tests, then implementation:

Existing Dumbo SQLite driver coverage to mirror:

- D1 connection/pool integration: `src/packages/dumbo/src/storage/sqlite/d1/connections/connection.int.spec.ts`
- D1 generic Dumbo driver integration: `src/packages/dumbo/src/storage/sqlite/d1/connections/connection.int.generic.spec.ts`
- D1 batch command conflict integration: `src/packages/dumbo/src/storage/sqlite/d1/execute/batchCommand.int.spec.ts`
- D1 formatter integration: `src/packages/dumbo/src/storage/sqlite/d1/formatter/sqlFormatter.int.spec.ts`
- D1 transaction integration: `src/packages/dumbo/src/storage/sqlite/d1/transactions/transactions.int.spec.ts`
- D1 error unit coverage: `src/packages/dumbo/src/storage/sqlite/d1/d1Errors.unit.spec.ts`
- D1 error mapper unit/integration coverage: `src/packages/dumbo/src/storage/sqlite/d1/errors/errorMapper.unit.spec.ts` and `src/packages/dumbo/src/storage/sqlite/d1/execute/errorMapper.int.spec.ts`
- sqlite3 singleton/queueing unit coverage where pool behavior is shared or comparable: `src/packages/dumbo/src/storage/sqlite/sqlite3/pool/singletonPool.unit.spec.ts`
- sqlite3 connection, formatter, batch command, changes count, and transaction integration tests where D1 does not cover a comparable behavior.

### Dumbo SQLite Test Case Inventory To Mirror

This inventory is generated from the existing D1 and sqlite3 specs. Durable Object SQLite tests must reference one or more of these cases when added. If a case is not applicable, the DO spec or `todo.md` must state the Durable Object-specific reason.

#### Connection And Pool Integration

Primary DO target: `src/packages/dumbo/src/storage/sqlite/durableObject/connections/connection.int.spec.ts`

Reference cases:

- D1 `connections/connection.int.spec.ts:27`: returns the singleton connection.
- D1 `connections/connection.int.spec.ts:44`: calls SQL correctly using default config.
- D1 `connections/connection.int.spec.ts:61`: connects using client.
- D1 `connections/connection.int.spec.ts:75`: connects using ambient client.
- D1 `connections/connection.int.spec.ts:94`: connects using connected ambient connected connection from pool.
- D1 `connections/connection.int.spec.ts:115`: connects using connected ambient connected connection.
- D1 `connections/connection.int.spec.ts:140`: withConnection on ambient pool does not close the ambient connection.
- D1 `connections/connection.int.spec.ts:165`: connects using connected ambient not-connected connection.
- D1 `connections/connection.int.spec.ts:185`: connects using ambient connected connection with transaction and session_based mode.
- D1 `connections/connection.int.spec.ts:213`: connects using ambient not-connected connection with transaction and session_based mode.
- D1 `connections/connection.int.spec.ts:241`: connects using ambient connection in withConnection scope.
- D1 `connections/connection.int.spec.ts:264`: connects using ambient connection in withConnection and withTransaction scope and session_based mode.
- sqlite3 `connections/connection.int.spec.ts:46`: returns the singleton connection.
- sqlite3 `connections/connection.int.spec.ts:66`: returns the same connection from writer sub-pool.
- sqlite3 `connections/connection.int.spec.ts:88`: returns the new connection for readonly option and no options.
- sqlite3 `connections/connection.int.spec.ts:112`: returns the new connection for readonly option and not readonly.
- sqlite3 `connections/connection.int.spec.ts:136`: for singleton setting returns the singleton connection.
- sqlite3 `connections/connection.int.spec.ts:162`: connects using default pool.
- sqlite3 `connections/connection.int.spec.ts:179`: connects using client.
- sqlite3 `connections/connection.int.spec.ts:219`: connects using connected ambient connected connection from pool.
- sqlite3 `connections/connection.int.spec.ts:244`: connects using connected ambient connected connection.
- sqlite3 `connections/connection.int.spec.ts:273`: connects using connected ambient connected connection and using transaction on pool.
- sqlite3 `connections/connection.int.spec.ts:307`: withConnection on ambient pool does not close the ambient connection.
- sqlite3 `connections/connection.int.spec.ts:336`: connects using connected ambient not-connected connection.
- sqlite3 `connections/connection.int.spec.ts:360`: connects using ambient connected connection with transaction.
- sqlite3 `connections/connection.int.spec.ts:391`: connects using ambient not-connected connection with transaction.
- sqlite3 `connections/connection.int.spec.ts:421`: connects using ambient connection in withConnection scope.
- sqlite3 `connections/connection.int.spec.ts:448`: connects using ambient connection in withConnection and withTransaction scope.
- sqlite3 `connections/connection.int.spec.ts:478`: handles concurrent writes and consumers without SQLITE_BUSY.
- sqlite3 `connections/connection.int.spec.ts:554`: handles concurrent readonly reads without blocking.
- sqlite3 `connections/connection.int.spec.ts:604`: handles concurrent reads and writes through separate pools.
- sqlite3 `connections/connection.int.spec.ts:663`: handles concurrent writes with connection.transaction() and reads.
- sqlite3 `connections/connection.int.spec.ts:732`: handles concurrent writes with connection.withTransaction() and reads.
- sqlite3 `connections/connection.int.spec.ts:803`: handles concurrent writes with pool.transaction() and reads.
- sqlite3 `connections/connection.int.spec.ts:867`: handles concurrent writes with pool.withTransaction() and reads.
- sqlite3 `connections/connection.int.spec.ts:932`: reuses reader pool connections after close.
- sqlite3 `connections/connection.int.spec.ts:972`: handles parallel connection opens without SQLITE_BUSY.

DO applicability:

- D1 ambient/runtime-handle cases are directly applicable.
- sqlite3 readonly and dual-pool cases are not directly applicable because Durable Object storage is single-object, runtime-provided storage with no read-only connection pool. If skipped, document this in the DO spec.
- sqlite3 concurrency cases should be adapted to Durable Object semantics, not copied mechanically. Durable Objects serialize work per object, so tests should verify no driver deadlock/reentrancy rather than separate reader/writer pooling.

#### Generic Dumbo Driver Integration

Primary DO target: `src/packages/dumbo/src/storage/sqlite/durableObject/connections/connection.int.generic.spec.ts`

Reference cases:

- D1 `connections/connection.int.generic.spec.ts:27`: returns the new connection each time.
- D1 `connections/connection.int.generic.spec.ts:49`: for singleton setting returns the singleton connection.
- D1 `connections/connection.int.generic.spec.ts:72`: connects using default pool.
- D1 `connections/connection.int.generic.spec.ts:90`: connects using client.
- D1 `connections/connection.int.generic.spec.ts:107`: connects using ambient client.
- D1 `connections/connection.int.generic.spec.ts:127`: connects using connected ambient connected connection.
- D1 `connections/connection.int.generic.spec.ts:150`: connects using connected ambient not-connected connection.
- D1 `connections/connection.int.generic.spec.ts:172`: connects using ambient connected connection with transaction.
- D1 `connections/connection.int.generic.spec.ts:201`: connects using ambient not-connected connection with transaction.
- D1 `connections/connection.int.generic.spec.ts:229`: connects using ambient connection in withConnection scope.
- D1 `connections/connection.int.generic.spec.ts:254`: connects using ambient connection in withConnection and withTransaction scope.
- sqlite3 `connections/connection.int.generic.spec.ts:47`: returns the singleton connection.
- sqlite3 `connections/connection.int.generic.spec.ts:71`: returns the new readonly connection.
- sqlite3 `connections/connection.int.generic.spec.ts:93`: returns the same writable connection each time.
- sqlite3 `connections/connection.int.generic.spec.ts:120`: for singleton setting returns the singleton connection.
- sqlite3 `connections/connection.int.generic.spec.ts:150`: connects using default pool.
- sqlite3 `connections/connection.int.generic.spec.ts:168`: connects using client.
- sqlite3 `connections/connection.int.generic.spec.ts:186`: connects using ambient client.
- sqlite3 `connections/connection.int.generic.spec.ts:209`: connects using connected ambient connected connection.
- sqlite3 `connections/connection.int.generic.spec.ts:237`: connects using connected ambient not-connected connection.
- sqlite3 `connections/connection.int.generic.spec.ts:263`: connects using ambient connected connection with transaction.
- sqlite3 `connections/connection.int.generic.spec.ts:296`: connects using ambient not-connected connection with transaction.
- sqlite3 `connections/connection.int.generic.spec.ts:328`: connects using ambient connection in withConnection scope.
- sqlite3 `connections/connection.int.generic.spec.ts:357`: connects using ambient connection in withConnection and withTransaction scope.

DO applicability:

- Add after `cloudflareDurableObjectSQLiteDumboDriver` is registered. Before registration, these tests should not exist as skipped top-level placeholders.
- Readonly cases are not applicable unless the driver exposes a readonly option.

#### Execution, Batch Command, And Row Counts

Primary DO targets:

- `src/packages/dumbo/src/storage/sqlite/durableObject/execute/batchCommand.int.spec.ts`
- `src/packages/dumbo/src/storage/sqlite/durableObject/execute/changesCount.int.spec.ts`

Reference cases:

- D1 `execute/batchCommand.int.spec.ts:35`: reports the conflict with a dedicated error type distinct from a generic database failure.
- sqlite3 `execute/batchCommand.int.spec.ts:36`: throws BatchCommandNoChangesError when assertChanges is true and a command affects no rows.
- sqlite3 `execute/batchCommand.int.spec.ts:52`: reports the conflict with a dedicated error type distinct from a generic database failure.
- sqlite3 `execute/batchCommand.int.spec.ts:68`: stops executing subsequent commands after assertChanges failure.
- sqlite3 `execute/batchCommand.int.spec.ts:89`: succeeds when assertChanges is true and all commands affect rows.
- sqlite3 `execute/batchCommand.int.spec.ts:103`: does not check changes when assertChanges is not set.
- sqlite3 `execute/changesCount.int.spec.ts:26`: returns correct rowCount for INSERT.
- sqlite3 `execute/changesCount.int.spec.ts:33`: returns correct rowCount for multi-row INSERT.
- sqlite3 `execute/changesCount.int.spec.ts:40`: returns correct rowCount for UPDATE.
- sqlite3 `execute/changesCount.int.spec.ts:50`: returns correct rowCount for DELETE.
- sqlite3 `execute/changesCount.int.spec.ts:60`: returns 0 rowCount when no rows affected.
- sqlite3 `execute/changesCount.int.spec.ts:67`: returns correct rowCount for INSERT with RETURNING.
- sqlite3 `execute/changesCount.int.spec.ts:75`: returns correct rowCount for UPDATE with RETURNING.
- sqlite3 `execute/changesCount.int.spec.ts:86`: returns correct rowCount for INSERT ON CONFLICT DO NOTHING with RETURNING.
- sqlite3 `execute/changesCount.int.spec.ts:98`: returns correct rowCount across sequential commands.

DO applicability:

- Use Miniflare-backed SQLite Durable Objects because `rowsWritten` is Cloudflare-specific and must be verified in runtime.
- Add a focused fake cursor unit test under `durableObject/execute` only for synchronous cursor-consumption timing, because Miniflare cannot easily prove when the cursor was consumed.

#### Formatter Integration

Primary DO target: `src/packages/dumbo/src/storage/sqlite/durableObject/formatter/sqlFormatter.int.spec.ts`

Reference cases:

- D1 `formatter/sqlFormatter.int.spec.ts:40` and sqlite3 `formatter/sqlFormatter.int.spec.ts:35`: throws error for empty arrays in IN clauses.
- D1 `formatter/sqlFormatter.int.spec.ts:54` and sqlite3 `formatter/sqlFormatter.int.spec.ts:49`: handles non-empty arrays correctly.
- D1 `formatter/sqlFormatter.int.spec.ts:68` and sqlite3 `formatter/sqlFormatter.int.spec.ts:63`: handles empty arrays by returning FALSE, so no records.
- D1 `formatter/sqlFormatter.int.spec.ts:79` and sqlite3 `formatter/sqlFormatter.int.spec.ts:74`: handles non-empty arrays with standard IN clause.
- D1 `formatter/sqlFormatter.int.spec.ts:91` and sqlite3 `formatter/sqlFormatter.int.spec.ts:86`: handles string array with single value.
- D1 `formatter/sqlFormatter.int.spec.ts:102` and sqlite3 `formatter/sqlFormatter.int.spec.ts:97`: handles string array with multiple values.
- D1 `formatter/sqlFormatter.int.spec.ts:113` and sqlite3 `formatter/sqlFormatter.int.spec.ts:108`: handles empty string arrays.
- sqlite3 `formatter/sqlFormatter.int.spec.ts:121`: handles mode: params using IN syntax.
- sqlite3 `formatter/sqlFormatter.int.spec.ts:132`: handles mode: native falling back to params.
- sqlite3 `formatter/sqlFormatter.int.spec.ts:143`: handles mode: params with string array.
- sqlite3 `formatter/sqlFormatter.int.spec.ts:156`: handles SQL.array mode: params with IN syntax.
- sqlite3 `formatter/sqlFormatter.int.spec.ts:167`: handles SQL.array mode: native falling back to params.
- sqlite3 `formatter/sqlFormatter.int.spec.ts:178`: handles SQL.array without mode option.
- D1 `formatter/sqlFormatter.int.spec.ts:132` and sqlite3 `formatter/sqlFormatter.int.spec.ts:197`: stores object params with single quotes without escaping them.
- D1 `formatter/sqlFormatter.int.spec.ts:149` and sqlite3 `formatter/sqlFormatter.int.spec.ts:214`: stores nested object params with single quotes without escaping them.

DO applicability:

- Use Miniflare-backed Durable Object SQL to verify the shared SQLite formatter against Cloudflare `SqlStorage.exec`.
- Include sqlite3-only SQL.array mode cases unless Cloudflare `SqlStorage.exec` rejects a binding shape; if rejected, document the Cloudflare-specific difference.

#### Transactions

Primary DO targets:

- `src/packages/dumbo/src/storage/sqlite/durableObject/transactions/transactions.int.spec.ts`
- `src/packages/dumbo/src/storage/sqlite/durableObject/transactions/transactionErrorSuppression.int.spec.ts`

Reference cases:

- sqlite3 `transactions/transactions.int.spec.ts:38`: commits a nested transaction with pool.
- sqlite3 `transactions/transactions.int.spec.ts:79`: keeps the outer transaction open after a sibling nested transaction commits.
- sqlite3 `transactions/transactions.int.spec.ts:117`: should fail with an error if transaction nested is false.
- sqlite3 `transactions/transactions.int.spec.ts:156`: should try catch and roll back everything when the inner transaction errors for a pooled connection.
- sqlite3 `transactions/transactions.int.spec.ts:197`: should try catch and roll back everything when the outer transactions errors for a pooled connection.
- sqlite3 `transactions/transactions.int.spec.ts:251`: commits a nested transaction with singleton pool.
- sqlite3 `transactions/transactions.int.spec.ts:298`: transactions errors inside the nested inner transaction for a singleton should try catch and roll back everything.
- sqlite3 `transactions/transactions.int.spec.ts:346`: transactions errors inside the outer transaction for a singleton should try catch and roll back everything.
- sqlite3 `transactions/transactions.int.spec.ts:396`: accepts transaction mode DEFERRED.
- sqlite3 `transactions/transactions.int.spec.ts:421`: accepts transaction mode IMMEDIATE.
- sqlite3 `transactions/transactions.int.spec.ts:446`: accepts transaction mode EXCLUSIVE.
- sqlite3 `transactions/transactions.int.spec.ts:471`: accepts readonly in transaction options.
- sqlite3 `transactions/transactions.int.spec.ts:496`: accepts both mode and readonly in transaction options.
- sqlite3 `transactions/transactions.int.spec.ts:1013`: uses IMMEDIATE mode by default.
- sqlite3 `transactions/transactions.int.spec.ts:1038`: can override to DEFERRED mode.
- sqlite3 `transactions/transactions.int.spec.ts:1066`: can override to EXCLUSIVE mode.
- sqlite3 `transactions/transactions.int.spec.ts:1094`: respects defaultTransactionMode from connection options.
- sqlite3 `transactions/transactions.int.spec.ts:1122`: transaction option mode overrides defaultTransactionMode.
- sqlite3 `transactions/transactionErrorSuppression.int.spec.ts:8`: should surface the original callback error, not the rollback error.
- D1 `transactions/transactions.int.spec.ts:26`: throws D1TransactionNotSupportedError when mode is not specified.
- D1 `transactions/transactions.int.spec.ts:55`: throws D1TransactionNotSupportedError when mode is strict.
- D1 `transactions/transactions.int.spec.ts:90`: allows transaction when mode is session_based.
- D1 `transactions/transactions.int.spec.ts:122`: commits a nested transaction with pool.
- D1 `transactions/transactions.int.spec.ts:169`: should fail with an error if transaction nested is false.
- D1 `transactions/transactions.int.spec.ts:214`: should try catch and NOT roll back everything when the inner transaction errors for a pooled connection.
- D1 `transactions/transactions.int.spec.ts:266`: should try catch and NOT roll back everything when the outer transactions errors for a pooled connection.
- D1 `transactions/transactions.int.spec.ts:330`: commits a nested transaction with singleton pool.
- D1 `transactions/transactions.int.spec.ts:380`: transactions errors inside the nested inner transaction for a singleton should try catch and NOT roll back everything.
- D1 `transactions/transactions.int.spec.ts:439`: transactions errors inside the outer transaction for a singleton should try catch and NOT roll back everything.

DO applicability:

- sqlite3 is the semantic baseline for commit/rollback. D1 is only a Cloudflare API contrast because D1 sessions do not provide the rollback behavior Dumbo/Pongo need.
- Add Durable Object-specific cases: async `storage.transaction(async () => ...)`, rollback across an `await Promise.resolve()`, commit across an `await Promise.resolve()`, raw `sql` fails for transactions because no `storage.transaction` exists, and transaction-control SQL is never emitted.
- Transaction mode SQL (`DEFERRED`, `IMMEDIATE`, `EXCLUSIVE`) cannot be emitted through `SqlStorage.exec`. Either ignore/reject those options with explicit tests, or map them only if Cloudflare exposes a safe non-SQL API.
- Savepoint/nested transaction cases must be verified against Cloudflare behavior. Do not copy sqlite3 savepoint expectations unless Miniflare proves they work without emitting savepoint SQL.

Additional Durable Object transaction tests:

- `storage.transaction(async () => ...)` rolls back writes before and after `await Promise.resolve()` when the callback throws. This is the PoC-backed design decision and must be in `durableObject/transactions/transactions.int.spec.ts`.
- `storage.transaction(async () => ...)` commits writes before and after `await Promise.resolve()` when the callback returns successfully.
- Starting a transaction with only raw `sql` and no full `storage` rejects with `InvalidOperationError`.
- `transactionSync` is never called. Use a fake storage unit test only for this call-shape assertion if Miniflare cannot observe it.
- SQL text sent to `ctx.storage.sql.exec()` never contains `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, or `RELEASE`. Use a fake `SqlStorage` unit test only for this call-shape assertion if Miniflare cannot observe it.
- If nested transaction support is implemented, nested commit and nested rollback must be tested against Miniflare. If it is rejected, test the exact rejection and document that Cloudflare SQL savepoints are unavailable through `SqlStorage.exec`.

Dropped or adapted transaction cases:

- sqlite3 transaction mode cases (`DEFERRED`, `IMMEDIATE`, `EXCLUSIVE`) are not directly portable because Cloudflare `SqlStorage.exec()` forbids transaction-control SQL. They should be rejected or ignored with explicit tests, not silently accepted as if SQLite transaction modes were applied.
- D1 "does NOT roll back everything" cases are not copied because Durable Object SQLite async storage transactions do roll back per the PoC. They are useful only as contrast.
- sqlite3 rollback-failure suppression is added only if a reliable Cloudflare rollback-failure trigger exists. Otherwise document the skipped case.

#### Error Mapping

Primary DO targets:

- `src/packages/dumbo/src/storage/sqlite/durableObject/errors/errorMapper.unit.spec.ts`
- `src/packages/dumbo/src/storage/sqlite/durableObject/execute/errorMapper.int.spec.ts`

Reference cases:

- D1 `errors/errorMapper.unit.spec.ts:30`: returns DumboError(500) for a plain Error without D1 content.
- D1 `errors/errorMapper.unit.spec.ts:37`: returns DumboError(500) for a non-Error value.
- D1 `errors/errorMapper.unit.spec.ts:46`: returns DumboError(500) for an error with unrelated message.
- D1 `errors/errorMapper.unit.spec.ts:57`: maps UNIQUE constraint to UniqueConstraintError.
- D1 `errors/errorMapper.unit.spec.ts:76`: maps PRIMARY KEY constraint to UniqueConstraintError.
- D1 `errors/errorMapper.unit.spec.ts:89`: maps FOREIGN KEY constraint to ForeignKeyViolationError.
- D1 `errors/errorMapper.unit.spec.ts:102`: maps NOT NULL constraint to NotNullViolationError.
- D1 `errors/errorMapper.unit.spec.ts:115`: maps CHECK constraint to CheckViolationError.
- D1 `errors/errorMapper.unit.spec.ts:128`: maps generic constraint to IntegrityConstraintViolationError.
- D1 `errors/errorMapper.unit.spec.ts:141`: maps constraint with SQLITE_CONSTRAINT prefix in message.
- D1 `errors/errorMapper.unit.spec.ts:152`: maps D1_TYPE_ERROR to DataError.
- D1 `errors/errorMapper.unit.spec.ts:166`: maps D1_COLUMN_NOTFOUND to DataError.
- D1 `errors/errorMapper.unit.spec.ts:172`: maps D1_DUMP_ERROR to SystemError.
- D1 `errors/errorMapper.unit.spec.ts:185`: maps D1_SESSION_ERROR to ConnectionError.
- D1 `errors/errorMapper.unit.spec.ts:198`: maps D1_EXEC_ERROR to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:214`: maps "Network connection lost." to ConnectionError.
- D1 `errors/errorMapper.unit.spec.ts:225`: maps transient resolve error to ConnectionError.
- D1 `errors/errorMapper.unit.spec.ts:233`: maps D1 DB reset to ConnectionError.
- D1 `errors/errorMapper.unit.spec.ts:241`: maps overloaded DB to InsufficientResourcesError.
- D1 `errors/errorMapper.unit.spec.ts:254`: maps too many requests to InsufficientResourcesError.
- D1 `errors/errorMapper.unit.spec.ts:262`: maps memory limit to InsufficientResourcesError.
- D1 `errors/errorMapper.unit.spec.ts:272`: maps D1_ERROR + SQLITE_BUSY to LockNotAvailableError.
- D1 `errors/errorMapper.unit.spec.ts:285`: maps D1_ERROR + SQLITE_LOCKED to DeadlockError.
- D1 `errors/errorMapper.unit.spec.ts:298`: maps D1_ERROR + SQLITE_CANTOPEN to ConnectionError.
- D1 `errors/errorMapper.unit.spec.ts:311`: maps D1_ERROR + SQLITE_NOMEM to InsufficientResourcesError.
- D1 `errors/errorMapper.unit.spec.ts:324`: maps D1_ERROR + SQLITE_IOERR to SystemError.
- D1 `errors/errorMapper.unit.spec.ts:337`: maps D1_ERROR + SQLITE_CORRUPT to SystemError.
- D1 `errors/errorMapper.unit.spec.ts:345`: maps D1_ERROR + SQLITE_TOOBIG to DataError.
- D1 `errors/errorMapper.unit.spec.ts:356`: maps D1_ERROR + SQLITE_MISMATCH to DataError.
- D1 `errors/errorMapper.unit.spec.ts:363`: maps D1_ERROR + SQLITE_RANGE to DataError.
- D1 `errors/errorMapper.unit.spec.ts:370`: maps D1_ERROR + SQLITE_ERROR to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:383`: maps D1_ERROR + SQLITE_READONLY to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:392`: maps D1_ERROR + SQLITE_AUTH to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:399`: maps D1_ERROR + SQLITE_PERM to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:406`: maps D1_ERROR + SQLITE_SCHEMA to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:413`: maps D1_ERROR + SQLITE_ABORT to SerializationError.
- D1 `errors/errorMapper.unit.spec.ts:426`: maps D1_ERROR + SQLITE_INTERRUPT to SerializationError.
- D1 `errors/errorMapper.unit.spec.ts:434`: maps D1_ERROR + SQLITE_FULL to InsufficientResourcesError.
- D1 `errors/errorMapper.unit.spec.ts:442`: maps D1_ERROR + SQLITE_PROTOCOL to LockNotAvailableError.
- D1 `errors/errorMapper.unit.spec.ts:450`: maps D1_ERROR + SQLITE_NOTADB to ConnectionError.
- D1 `errors/errorMapper.unit.spec.ts:458`: maps D1_ERROR + SQLITE_INTERNAL to SystemError.
- D1 `errors/errorMapper.unit.spec.ts:465`: maps D1_ERROR + SQLITE_NOLFS to SystemError.
- D1 `errors/errorMapper.unit.spec.ts:472`: maps D1_ERROR + SQLITE_MISUSE to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:481`: falls back to InvalidOperationError for D1_ERROR with unknown SQLITE code.
- D1 `errors/errorMapper.unit.spec.ts:488`: falls back to InvalidOperationError for D1_ERROR without SQLITE code.
- D1 `errors/errorMapper.unit.spec.ts:495`: maps D1_EXEC_ERROR + SQLITE_ERROR to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:504`: maps D1_EXEC_ERROR without SQLITE code to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:513`: maps SQLITE_BUSY in bare message to LockNotAvailableError.
- D1 `errors/errorMapper.unit.spec.ts:524`: maps SQLITE_ERROR in bare message to InvalidOperationError.
- D1 `errors/errorMapper.unit.spec.ts:529`: maps SQLITE_CORRUPT in bare message to SystemError.
- D1 `errors/errorMapper.unit.spec.ts:538`: sets innerError to original error.
- D1 `errors/errorMapper.unit.spec.ts:547`: preserves original error message.
- D1 `errors/errorMapper.unit.spec.ts:556`: returns the same DumboError if error is already a DumboError.
- D1 `errors/errorMapper.unit.spec.ts:562`: returns the same IntegrityConstraintViolationError.
- D1 `errors/errorMapper.unit.spec.ts:568`: returns the same generic DumboError.
- D1 `errors/errorMapper.unit.spec.ts:577`: returns the same custom DumboError.
- D1 `execute/errorMapper.int.spec.ts:35`: maps unique constraint violation to UniqueConstraintError.
- D1 `execute/errorMapper.int.spec.ts:74`: maps NOT NULL violation to NotNullViolationError.
- D1 `execute/errorMapper.int.spec.ts:103`: maps foreign key violation to ForeignKeyViolationError.
- D1 `execute/errorMapper.int.spec.ts:138`: maps CHECK violation to CheckViolationError.
- D1 `execute/errorMapper.int.spec.ts:169`: maps syntax error to InvalidOperationError.
- D1 `execute/errorMapper.int.spec.ts:190`: maps undefined table to InvalidOperationError.
- D1 `execute/errorMapper.int.spec.ts:210`: maps unique constraint violation to UniqueConstraintError inside a session-based transaction.
- D1 `execute/errorMapper.int.spec.ts:264`: wraps original D1 error as innerError.
- sqlite3 `execute/errorMapper.int.spec.ts:26`: maps unique constraint violation to UniqueConstraintError.
- sqlite3 `execute/errorMapper.int.spec.ts:64`: maps NOT NULL violation to NotNullViolationError.
- sqlite3 `execute/errorMapper.int.spec.ts:92`: maps foreign key violation to ForeignKeyViolationError.
- sqlite3 `execute/errorMapper.int.spec.ts:126`: maps CHECK violation to CheckViolationError.
- sqlite3 `execute/errorMapper.int.spec.ts:156`: maps syntax error to InvalidOperationError.
- sqlite3 `execute/errorMapper.int.spec.ts:173`: maps undefined table to InvalidOperationError.
- sqlite3 `execute/errorMapper.int.spec.ts:189`: maps unique constraint violation to UniqueConstraintError inside a transaction.
- sqlite3 `execute/errorMapper.int.spec.ts:233`: wraps original sqlite3 error as innerError.
- sqlite3 `execute/errorMapper.int.spec.ts:263`: maps SQLITE_BUSY to LockNotAvailableError when BEGIN TRANSACTION fails.

DO applicability:

- Use runtime integration tests to learn Cloudflare Durable Object error messages before adding a DO-specific mapper.
- If errors are bare `SQLITE_*`, prefer reusing shared SQLite mapping and write tests to prove that. Do not copy D1 prefix-specific mapper cases unless Durable Object storage returns D1-like prefixes.

Additional Durable Object error mapping tests:

- Runtime unique, primary key, not null, foreign key, check, syntax, and undefined table failures through `ctx.storage.sql.exec()` to learn the actual Cloudflare error shape.
- Mapper unit tests only after the runtime shape is known. Do not assume D1 prefixes.

#### sqlite3-Only Pool And PRAGMA Cases

Reference cases:

- sqlite3 `pool/dualPool.int.spec.ts:30`: creates dual pool by default for file-based databases.
- sqlite3 `pool/dualPool.int.spec.ts:54`: uses singleton pool for in-memory databases.
- sqlite3 `pool/dualPool.int.spec.ts:74`: allows explicit singleton pool for file-based databases.
- sqlite3 `pool/dualPool.int.spec.ts:105`: handles concurrent reads during writes.
- sqlite3 `pool/dualPool.int.spec.ts:146`: handles transactions with dual pool.
- sqlite3 `pool/dualPool.int.spec.ts:181`: respects custom reader pool size.
- sqlite3 `pool/dualPool.int.spec.ts:208`: releases connections on query errors.
- sqlite3 `pool/dualPool.int.spec.ts:248`: releases connections on transaction rollback.
- sqlite3 `pool/dualPool.int.spec.ts:293`: handles parallel connection creation during pool initialization.
- sqlite3 `pool/dualPool.int.spec.ts:323`: respects allowNestedTransactions from connectionOptions in dual pool writer.
- sqlite3 `pool/dualPool.int.spec.ts:362`: dual pool writer throws actionable error on nested withTransaction when allowNestedTransactions is false.
- sqlite3 `pool/dualPool.unit.spec.ts:47`: lets database initialization observe caller abort while opening the initial connection.
- sqlite3 `pool/poolReentrancy.int.spec.ts:50`: runs a query on a connection acquired inside another connection.
- sqlite3 `pool/poolReentrancy.int.spec.ts:72`: runs a transaction opened inside a connection.
- sqlite3 `pool/poolReentrancy.int.spec.ts:94`: runs a query on a connection acquired inside a transaction.
- sqlite3 `pool/singletonPool.unit.spec.ts:57`: does not start queued writer work when the caller aborts while waiting.
- sqlite3 `pool/singletonPool.unit.spec.ts:103`: lets withConnection nest inside withConnection.
- sqlite3 `pool/singletonPool.unit.spec.ts:119`: lets withConnection nest inside withTransaction.
- sqlite3 `pool/singletonPool.unit.spec.ts:140`: lets withTransaction nest inside withConnection.
- sqlite3 `connections/pragmas.int.spec.ts:32`: applies default PRAGMA values on connection.
- sqlite3 `connections/pragmas.int.spec.ts:65`: applies PRAGMA values from connection string.
- sqlite3 `connections/pragmas.int.spec.ts:90`: applies PRAGMA values from code options.
- sqlite3 `connections/pragmas.int.spec.ts:120`: code options override connection string.
- sqlite3 `connections/pragmas.int.spec.ts:138`: applies PRAGMAs to in-memory database.
- sqlite3 `connections/pragmas.int.spec.ts:161`: WAL mode persists across connections.
- sqlite3 `connections/pragmas.int.spec.ts:185`: enforces foreign key constraints when enabled.
- sqlite3 `connections/pragmas.int.spec.ts:221`: allows foreign key violations when disabled.

DO applicability:

- Dual-pool and file/in-memory selection do not apply to Durable Object storage.
- PRAGMA support should not be assumed. Add DO PRAGMA tests only for PRAGMAs the driver intentionally supports and Cloudflare accepts through `SqlStorage.exec`.
- Pool reentrancy and singleton queueing are relevant only if the DO pool implementation introduces queueing. If it delegates to existing singleton pool behavior, either reuse existing tests indirectly or add focused DO tests only for DO-specific options.

Dropped or adapted pool/PRAGMA cases:

- sqlite3 dual-pool file-vs-memory tests are dropped for Durable Object SQLite because the runtime owns storage lifecycle and there is no file path or separate reader pool.
- sqlite3 readonly connection tests are dropped unless the driver exposes readonly behavior.
- sqlite3 WAL PRAGMA persistence tests are dropped unless Cloudflare documents and accepts those PRAGMAs for Durable Object SQLite.
- sqlite3 foreign-key PRAGMA tests are added only if the driver manages PRAGMA setup. Otherwise foreign-key behavior belongs in error mapping/runtime behavior tests.

Durable Object SQLite test files should mimic the existing driver layout. Do not add top-level catch-all specs such as `durableObjectSQLiteSkeleton.unit.spec.ts` or `durableObjectSQLiteHarness.int.spec.ts`; those do not match the repo structure. Put tests next to the behavior they cover:

| Durable Object SQLite test file                                                                     | Primary reference                                                                                         | Why                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `durableObject/connections/connection.int.spec.ts`                                                  | `d1/connections/connection.int.spec.ts`; `sqlite3/connections/connection.int.spec.ts`                     | Connection/pool usage is closest to D1 because both are Cloudflare/runtime-provided handles, but sqlite3 has broader ambient connection cases.                                         |
| `durableObject/connections/connection.int.generic.spec.ts`                                          | `d1/connections/connection.int.generic.spec.ts`; `sqlite3/connections/connection.int.generic.spec.ts`     | Generic `dumbo({ driverType })` behavior once the driver is registered.                                                                                                                |
| `durableObject/execute/batchCommand.int.spec.ts`                                                    | `d1/execute/batchCommand.int.spec.ts`; `sqlite3/execute/batchCommand.int.spec.ts`                         | Batch command and `assertChanges` behavior must match both D1 error shape and sqlite3 stop-after-conflict coverage.                                                                    |
| `durableObject/execute/changesCount.int.spec.ts`                                                    | `sqlite3/execute/changesCount.int.spec.ts`                                                                | D1 does not cover enough affected-row cases. Durable Object `rowsWritten` has Cloudflare-specific semantics, so verify INSERT, multi-row INSERT, UPDATE, DELETE, no-op, and RETURNING. |
| `durableObject/formatter/sqlFormatter.int.spec.ts`                                                  | `d1/formatter/sqlFormatter.int.spec.ts`; `sqlite3/formatter/sqlFormatter.int.spec.ts`                     | Formatter behavior should match shared SQLite formatting through a real runtime database.                                                                                              |
| `durableObject/transactions/transactions.int.spec.ts`                                               | `sqlite3/transactions/transactions.int.spec.ts`; D1 transaction tests only for Cloudflare option contrast | sqlite3 is the baseline for actual commit/rollback behavior. Durable Object SQLite should rollback on thrown async callbacks, unlike D1.                                               |
| `durableObject/transactions/transactionErrorSuppression.int.spec.ts`                                | `sqlite3/transactions/transactionErrorSuppression.int.spec.ts`                                            | Preserve original callback errors; adapt only if Cloudflare runtime does not expose a reliable rollback-failure trigger.                                                               |
| `durableObject/durableObjectSQLiteErrors.unit.spec.ts`                                              | `d1/d1Errors.unit.spec.ts`                                                                                | Unit coverage for missing storage/sql/connection and transaction-before-supported/required-storage errors.                                                                             |
| `durableObject/errors/errorMapper.unit.spec.ts` and `durableObject/execute/errorMapper.int.spec.ts` | D1 error mapper specs and sqlite3 error mapper specs                                                      | Add if Cloudflare Durable Object errors need distinct mapping; otherwise document reuse of shared SQLite mapping and skip dedicated files.                                             |

Durable Object specifics that every relevant test file must account for:

- Use Miniflare-backed SQLite Durable Objects for integration tests, configured with `durableObjects: { TEST_OBJECT: { className: "TestObject", useSQLite: true } }` and `migrations: [{ tag: "v1", new_sqlite_classes: ["TestObject"] }]`.
- Run Dumbo code inside the Durable Object where `ctx.storage` exists. Do not fake `DurableObjectStorage` for integration behavior.
- Keep SQL cursor consumption synchronous inside the driver; add a focused fake cursor unit test only if the behavior cannot be observed through Miniflare.
- Never emit `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, or `RELEASE` through `ctx.storage.sql.exec()`.
- Transactions should mirror sqlite3 outcomes for commit/rollback where Cloudflare supports them, plus the Durable Object-specific case of rollback across `await Promise.resolve()`.
- Raw `sql` tests may cover non-transaction execution only. Transaction tests must use full `storage`.

Keep coverage aligned with comparable D1/sqlite3 tests. If D1 or sqlite3 has a relevant connection, execution, transaction, export, or type test, Durable Object SQLite should get the same behavioral class of test unless the difference is inherent to Durable Object storage and documented in the spec file and `todo.md`.

Run:

- `npm run fix`
- `npm run build:ts -w packages/dumbo`
- targeted Durable Object SQLite unit tests
- targeted Durable Object SQLite integration tests
- targeted Vitest tests for the new adapter
- existing D1 targeted tests to protect Cloudflare exports

## Pongo Implementation Blueprint

After Dumbo is green:

1. Add `src/packages/pongo/src/storage/sqlite/durableObject`.
2. Mirror `src/packages/pongo/src/storage/sqlite/d1/index.ts`, replacing D1-specific names/options with Durable Object SQLite names/options.
3. Use `sqliteSQLBuilder` exactly as D1 does.
4. Accept `storage`, `sql`, `connection`, or `pool` through the Dumbo driver options.
5. Throw `PongoError('Durable Object SQLite storage, sql, connection, or pool is required')` when no usable ambient handle exists.
6. Export from `src/packages/pongo/src/cloudflare.ts`.
7. Register `Cloudflare:durableObjectSQLite` in `src/packages/pongo/src/index.ts` so lazy loading works through the existing `cloudflare` entry point.
8. Add type tests mirroring D1.
9. Add focused Pongo connection tests with a fake or Miniflare-backed storage.
10. Add a full Pongo e2e suite by mirroring the D1 suite once the runtime harness is proven.

## Right-Sized Implementation Chunks

### Phase 1 / Prompt 1: First real Dumbo Durable Object SQLite vertical slice

Reconcile the current skeleton code into a real behavior slice. Tests should be added gradually as implementation is built, and each test should describe how the driver works from a caller/runtime perspective. Do not write tests that merely assert stubs, placeholders, function existence, or internal implementation shape.

Because the current code already exposes connection, pool, executor, and transaction modules, Phase 1 must either implement the exposed behavior with matching tests or narrow/remove the exposed placeholder code until a later phase implements it.

Minimum acceptable Phase 1 behavior:

- Implement real non-transaction SQL execution through Cloudflare `SqlStorage.exec()`.
- Implement connection and pool enough to run real SQL inside a Miniflare-backed SQLite Durable Object.
- Keep transaction behavior narrowed or explicitly unsupported until the transaction phase; do not expose fake transaction behavior as if it were implemented.
- Add `durableObject/connections/connection.int.spec.ts`, mirroring applicable runtime-handle cases from D1 `connections/connection.int.spec.ts`.
- Add `durableObject/execute/changesCount.int.spec.ts`, mirroring sqlite3 `execute/changesCount.int.spec.ts` for real INSERT, multi-row INSERT, UPDATE, DELETE, no-op, RETURNING, and sequential commands.
- Add `durableObject/execute/batchCommand.int.spec.ts` if `batchCommand` is implemented in this phase, mirroring D1/sqlite3 `assertChanges` behavior.
- Keep tests in matching subfolders.
- Run `npm run fix`, targeted Phase 1 integration tests, and Dumbo build before marking complete.

### Chunk 2: Dumbo client query/command execution

Add fake `SqlStorage` unit tests first, mirroring D1/sqlite3 execution coverage, then implement `cloudflareDurableObjectSQLiteClient` for `query`, `batchQuery`, `command`, and `batchCommand` without transaction factory integration.

### Chunk 3: Dumbo connection and pool

Add connection/pool tests first, mirroring D1 where practical, then wire client into a `cloudflareDurableObjectSQLiteConnection` and `cloudflareDurableObjectSQLitePool`, requiring `storage` or `sql`. Cover ambient connection, singleton pool behavior, and missing option behavior.

### Chunk 4: Dumbo transaction semantics

Add transaction tests first, then add Durable Object specific transaction factory using async `storage.transaction()`. Cover callback result, error propagation, nested behavior, and no transaction SQL emission.

### Chunk 5: Dumbo driver registration and exports

Add driver registration/export/type tests first, then add `cloudflareDurableObjectSQLiteDumboDriver`, register it, export it from `cloudflare.ts`, and build.

### Chunk 6: Dumbo generic driver and formatter integration

Add Miniflare-backed Durable Object SQLite generic Dumbo driver and formatter integration tests in the matching subfolders. Do not add top-level smoke specs.

### Chunk 7: Pongo driver wrapper

Add Pongo driver/type tests first, then add Pongo Durable Object SQLite driver by mirroring D1 and using the new Dumbo pool/driver.

### Chunk 8: Pongo connection and full e2e tests

Add Pongo connection tests and a full D1-equivalent e2e suite for the new driver before or alongside the wrapper behavior they exercise.

### Chunk 9: Final export/build verification

Verify package entry points, lazy driver loading, TypeScript build, `npm run fix`, targeted unit tests, targeted integration tests, relevant D1 regression tests, and update docs or README snippets if the repo expects driver lists there.

## Code-Generation Prompts

### Prompt 1: Dumbo Durable Object SQLite Skeleton With Matching Test Placement

```text
You are working in /home/oskar/Repos/Pongo. Complete Phase 1 / Prompt 1 as the first real Dumbo Cloudflare Durable Object SQLite behavioral slice. Do not add tests for skeletons, stubs, function existence, or implementation details.

Read these files first:
- src/packages/dumbo/src/storage/sqlite/d1/connections/d1Client.ts
- src/packages/dumbo/src/storage/sqlite/d1/connections/d1Connection.ts
- src/packages/dumbo/src/storage/sqlite/d1/pool/d1ConnectionPool.ts
- src/packages/dumbo/src/storage/sqlite/d1/connections/connection.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/d1/execute/batchCommand.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/execute/batchCommand.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/execute/changesCount.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/core/connections/index.ts
- src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts
- src/packages/dumbo/src/cloudflare.ts

First inspect the current src/packages/dumbo/src/storage/sqlite/durableObject folder. Remove any tests that assert skeleton/stub behavior. Do not duplicate files or add redundant abstractions. Because connection, pool, executor, and transaction files already exist, either implement real behavior with tests or narrow/remove exposed placeholder behavior.

Tests first, in matching folders:
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/connections/connection.int.spec.ts`, mirroring applicable runtime-handle cases from D1 `connections/connection.int.spec.ts`.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/execute/changesCount.int.spec.ts`, mirroring sqlite3 `execute/changesCount.int.spec.ts` for real INSERT, multi-row INSERT, UPDATE, DELETE, no-op, RETURNING, and sequential commands.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/execute/batchCommand.int.spec.ts` if `batchCommand` is implemented in this phase, mirroring D1 and sqlite3 assertChanges cases.
- Use Miniflare SQLite-backed Durable Objects for integration tests. Run Dumbo code inside the Durable Object where `ctx.storage` exists.
- Test behavior, not implementation shape.

Implementation:
- Implement `cloudflareDurableObjectSQLiteClient` around `SqlStorage.exec()`.
- Resolve `SqlStorage` from `options.sql ?? options.storage?.sql`.
- Consume every cursor synchronously with `.toArray()` inside the method before any await boundary.
- Return query rows and rowCount; command rowCount must use Cloudflare `rowsWritten` and be verified by tests.
- Implement connection and pool only to the extent required by the behavioral tests.
- Keep transactions narrowed or clearly unsupported until the transaction phase; do not use `transactionSync`.
- Do not export from src/packages/dumbo/src/cloudflare.ts yet unless this phase also includes driver registration tests.

Run from src:
- npm run fix
- npx vitest run packages/dumbo/src/storage/sqlite/durableObject/connections/connection.int.spec.ts
- npx vitest run packages/dumbo/src/storage/sqlite/durableObject/execute/changesCount.int.spec.ts
- npx vitest run packages/dumbo/src/storage/sqlite/durableObject/execute/batchCommand.int.spec.ts if added
- npm run build:ts -w packages/dumbo

Before marking Phase 1 complete, run the mandatory review gate and record the result in todo.md. Phase 1 must not pass if it only adds tests for unimplemented stubs; either implement a real tested vertical slice or narrow/remove exposed placeholder behavior.
```

### Prompt 2: Dumbo Client Execution

```text
Continue from the Durable Object SQLite skeleton. Implement cloudflareDurableObjectSQLiteClient around Cloudflare SqlStorage.

Read:
- src/packages/dumbo/src/storage/sqlite/d1/connections/d1Client.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/connections/connection.ts
- src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts
- src/packages/dumbo/src/storage/sqlite/d1/execute/batchCommand.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/execute/batchCommand.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/execute/changesCount.int.spec.ts

Behavior:
- Resolve SqlStorage from options.sql ?? options.storage?.sql.
- Throw InvalidOperationError if neither is supplied.
- Use sqliteFormatter.format(sql, { serializer }) for query text and params.
- Call sqlStorage.exec(query, ...params).
- Consume cursor immediately using toArray().
- query returns rowCount = rows.length and rows.
- batchQuery executes each query sequentially and returns each result.
- command returns rows from the cursor and rowCount from cursor.rowsWritten, falling back to rows.length only for statements with returned rows if needed.
- batchCommand executes sequentially. If options.assertChanges is true and rowCount is 0, throw BatchCommandNoChangesError with the current index and stop.

Add tests before implementation:
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/execute/batchCommand.int.spec.ts`, mirroring both D1 and sqlite3 assertChanges cases.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/execute/changesCount.int.spec.ts`, mirroring sqlite3 changes-count cases and verifying Cloudflare `rowsWritten` behavior explicitly.
- Add a narrow fake cursor unit test only if needed to prove synchronous cursor consumption before awaits; place it under `durableObject/execute`, not at the durableObject root.

Keep tests local to the behavior folder. Run the targeted tests and Dumbo TypeScript build.

Run from src:
- npm run fix
- targeted Durable Object SQLite unit tests
- targeted Durable Object SQLite integration tests if any exist after this prompt, otherwise the nearest relevant D1/sqlite3 execution integration tests
- npm run build:ts -w packages/dumbo
```

### Prompt 3: Dumbo Connection And Pool

```text
Wire the Durable Object SQLite client into Dumbo connection and pool APIs.

Read:
- src/packages/dumbo/src/storage/sqlite/d1/connections/d1Connection.ts
- src/packages/dumbo/src/storage/sqlite/d1/pool/d1ConnectionPool.ts
- src/packages/dumbo/src/storage/sqlite/core/connections/index.ts
- src/packages/dumbo/src/core/connections/pool.ts
- src/packages/dumbo/src/storage/sqlite/d1/connections/connection.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/connections/connection.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/pool/singletonPool.unit.spec.ts

Implement:
- cloudflareDurableObjectSQLiteConnection(options)
- cloudflareDurableObjectSQLitePool(options)

The pool should be singleton/ambient because Durable Object storage is provided by the runtime. It should accept storage, sql, client, connection, or pool-equivalent options consistent with D1 where practical.

Use JSONSerializer.from(options) in the pool. Use sqliteAmbientClientConnection if it fits; otherwise use createAmbientConnection directly. Missing storage/sql/client/connection should throw InvalidOperationError with a clear Durable Object SQLite message.

Add tests before implementation:
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/connections/connection.int.spec.ts`, mirroring D1 connection tests because both D1 and Durable Object SQLite are Cloudflare runtime handles.
- Use a SQLite-backed Durable Object in Miniflare and construct the pool/connection inside the Durable Object with `ctx.storage` or `ctx.storage.sql`.
- Cover `SELECT 1`, construction from storage, construction from sql for non-transaction execution, ambient client, ambient connected connection, ambient not-connected connection, `withConnection`, and singleton behavior where it applies.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/pool/singletonPool.unit.spec.ts` only if Durable Object pool queueing/reentrancy needs local unit coverage comparable to sqlite3's singleton pool tests.
- Do not use fake storage for integration behavior that Miniflare can cover.

Run from src:
- npm run fix
- npx vitest run packages/dumbo/src/storage/sqlite/durableObject/connections/connection.int.spec.ts
- any added durableObject pool unit tests
- npm run build:ts -w packages/dumbo
```

### Prompt 4: Dumbo Durable Object Transactions

```text
Add real async transaction support for the Durable Object SQLite Dumbo adapter.

Read:
- src/packages/dumbo/src/storage/sqlite/core/transactions/index.ts
- src/packages/dumbo/src/storage/sqlite/d1/transactions/d1Transaction.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/transactions/transactions.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/transactions/transactionErrorSuppression.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/d1/transactions/transactions.int.spec.ts
- src/packages/dumbo/src/core/connections/transaction.ts
- Cloudflare Durable Object SQLite docs notes in plan.md

Implement a cloudflareDurableObjectSQLiteTransaction factory that:
- Uses storage.transaction(async () => callback) for the outer transaction when storage is available.
- Does not emit BEGIN, COMMIT, ROLLBACK, SAVEPOINT, or RELEASE SQL.
- Exposes transaction.execute using the same Durable Object SQLite client against the transaction-active storage/sql.
- Propagates callback results and errors through Dumbo's withTransaction flow.
- Supports nested behavior only if it is explicitly designed and tested. sqlite3 is the semantic baseline for rollback/commit expectations, but Cloudflare Durable Object SQL cannot emit SAVEPOINT statements. If nested transactions cannot be safely supported through Cloudflare storage semantics, reject nested transactions with InvalidOperationError instead of pretending savepoints work.
- If only raw sql is available and no storage is present, fail clearly when starting a transaction because Durable Object transactions require DurableObjectStorage.

Add tests before implementation:
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/transactions/transactions.int.spec.ts`, using Miniflare-backed SQLite Durable Objects.
- Mirror sqlite3 transaction outcomes where Durable Object storage supports them: commit persists rows, thrown callback rolls back rows, nested behavior is either supported and tested or rejected with a clear InvalidOperationError.
- Add the Durable Object-specific rollback-across-await case: insert before `await Promise.resolve()`, insert after it, throw, and assert neither row exists.
- Add a test proving transaction-control SQL is not emitted. Prefer observing SQL calls through a focused fake only if Miniflare cannot expose executed SQL text.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/transactions/transactionErrorSuppression.int.spec.ts` mirroring sqlite3 if a reliable Cloudflare rollback-failure condition can be created; otherwise document why this case does not apply.
- Include D1 transaction tests only as contrast for Cloudflare-specific unsupported transaction SQL/session behavior; do not copy D1's non-rollback expectations.

Run from src:
- npm run fix
- npx vitest run packages/dumbo/src/storage/sqlite/durableObject/transactions/transactions.int.spec.ts
- npx vitest run packages/dumbo/src/storage/sqlite/durableObject/transactions/transactionErrorSuppression.int.spec.ts if added
- npm run build:ts -w packages/dumbo
```

### Prompt 5: Dumbo Driver Registration And Cloudflare Export

```text
Register and export the Dumbo Durable Object SQLite driver.

Read:
- src/packages/dumbo/src/storage/sqlite/d1/index.ts
- src/packages/dumbo/src/cloudflare.ts
- src/packages/dumbo/src/core/drivers/databaseDriver.ts
- src/packages/dumbo/src/storage/sqlite/d1/d1Errors.unit.spec.ts

Implement cloudflareDurableObjectSQLiteDumboDriver:
- driverType: CloudflareDurableObjectSQLiteDriverType
- createPool: cloudflareDurableObjectSQLitePool
- sqlFormatter: sqliteFormatter
- defaultMigratorOptions: DefaultSQLiteMigratorOptions
- databaseMetadata: sqliteMetadata
- canHandle should return true for driverType 'Cloudflare:durableObjectSQLite' and storage/sql/connection/client options as appropriate.

Register with dumboDatabaseDriverRegistry on import. Export the durableObject adapter from src/packages/dumbo/src/cloudflare.ts. Add type tests for DumboConnectionOptions similar to D1. Run Dumbo TypeScript build and targeted Cloudflare/Durable Object tests.

Run from src:
- npm run fix
- targeted Durable Object SQLite unit/type tests
- targeted Cloudflare export/D1 regression tests touched by export changes
- npm run build:ts -w packages/dumbo
```

### Prompt 6: Dumbo Generic Driver And Formatter Integration Tests

```text
Add the remaining runtime-backed Dumbo integration tests for Durable Object SQLite that require the driver to be registered/exported.

Read:
- src/packages/dumbo/src/storage/sqlite/d1/connections/connection.int.generic.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/connections/connection.int.generic.spec.ts
- src/packages/dumbo/src/storage/sqlite/d1/formatter/sqlFormatter.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/formatter/sqlFormatter.int.spec.ts

Use the SQLite-backed Durable Object Miniflare setup from the transaction PoC and the earlier connection tests.

Add tests before implementation changes:
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/connections/connection.int.generic.spec.ts`, mirroring D1 generic Dumbo driver integration through `dumbo({ driverType: 'Cloudflare:durableObjectSQLite', storage: ctx.storage })`.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/formatter/sqlFormatter.int.spec.ts`, mirroring D1/sqlite3 formatter integration through the Durable Object driver.
- Keep tests in the matching subfolders; do not add top-level smoke specs.

Run from src:
- npm run fix
- npx vitest run packages/dumbo/src/storage/sqlite/durableObject/connections/connection.int.generic.spec.ts
- npx vitest run packages/dumbo/src/storage/sqlite/durableObject/formatter/sqlFormatter.int.spec.ts
- npm run build:ts -w packages/dumbo
```

### Prompt 7: Pongo Durable Object SQLite Driver

```text
Add the Pongo wrapper driver for Dumbo Durable Object SQLite.

Read:
- src/packages/pongo/src/storage/sqlite/d1/index.ts
- src/packages/pongo/src/storage/sqlite/d1/driver.type.spec.ts
- src/packages/pongo/src/cloudflare.ts
- src/packages/pongo/src/index.ts
- src/packages/pongo/src/core/drivers/databaseDriver.ts

Create src/packages/pongo/src/storage/sqlite/durableObject/index.ts by mirroring the D1 driver shape:
- Import CloudflareDurableObjectSQLiteDriverType, cloudflareDurableObjectSQLitePool, and cloudflareDurableObjectSQLiteDumboDriver from @event-driven-io/dumbo/cloudflare.
- Define options accepting storage?: DurableObjectStorage, sql?: SqlStorage, connectionOptions, pool, transactionOptions.
- databaseFactory should use withPongoTransactionOptions and PongoDatabase like D1 does.
- Use sqliteSQLBuilder.
- Throw PongoError if no storage/sql/connection/pool is available.
- Register with pongoDriverRegistry.
- Export aliases cloudflareDurableObjectSQLiteDriver and pongoDriver as appropriate.

Update src/packages/pongo/src/cloudflare.ts to export it. Update src/packages/pongo/src/index.ts lazy registration for 'Cloudflare:durableObjectSQLite' through the cloudflare entry. Add type tests similar to D1. Run Pongo TypeScript build and targeted type tests.

Run from src:
- npm run fix
- targeted Pongo Durable Object SQLite unit/type tests
- targeted Pongo integration tests for construction/connection if available
- npm run build:ts -w packages/pongo
```

### Prompt 8: Pongo Durable Object SQLite Full Tests

```text
Add full Pongo tests for the Durable Object SQLite driver.

Read:
- src/packages/pongo/src/e2e/sqlite/d1/d1.connections.int.spec.ts
- src/packages/pongo/src/e2e/sqlite/d1/d1.e2e.spec.ts
- src/packages/pongo/src/e2e/sqlite/sqlite3/sqlite3.connections.int.spec.ts

Start by reusing the smallest reliable runtime harness:
- If the Dumbo runtime-backed Durable Object test works, reuse that pattern.
- Otherwise use the fake SqlStorage/storage approach for connection-level tests and leave the full runtime e2e marked as blocked in todo.md.

Test:
- Pongo database can be constructed from storage/sql/connection.
- A collection can create schema/migrations through the new driver.
- insertOne/findOne/update/delete smoke path works.
- transaction-backed handle works if Dumbo transaction support is available in the harness.
- Mirror the full D1 e2e suite once runtime Durable Object storage is available in tests.

Run targeted Pongo tests and Pongo TypeScript build.

Run from src:
- npm run fix
- targeted Pongo Durable Object SQLite unit tests
- targeted Pongo Durable Object SQLite integration/e2e tests
- npm run build:ts -w packages/pongo
```

### Prompt 9: Final Verification And Cleanup

```text
Finish integration cleanup.

Check:
- No orphaned durableObject files are unexported unintentionally.
- src/packages/dumbo/src/cloudflare.ts exports D1 and Durable Object SQLite.
- src/packages/pongo/src/cloudflare.ts exports D1 and Durable Object SQLite.
- src/packages/pongo/src/index.ts can lazy-load 'Cloudflare:durableObjectSQLite'.
- package exports do not need changes because both packages already expose ./cloudflare.
- Driver names are stable and documented in tests.
- todo.md reflects completed and blocked items accurately.

Run:
- npm run fix
- npm run build:ts -w packages/dumbo
- npm run build:ts -w packages/pongo
- targeted Dumbo Durable Object unit tests
- targeted Dumbo Durable Object tests
- targeted Pongo Durable Object unit tests
- targeted Pongo Durable Object tests
- existing targeted D1 tests touched by cloudflare exports

Fix regressions. Summarize behavior, limitations, and exact test commands/results in the final response.
```

## Known Risks And Decisions To Revisit

- The exact Miniflare API for SQLite-backed Durable Object storage may require additional setup. Do not assume D1-style `getD1Database()` exists for Durable Object storage.
- Durable Object `SqlStorage.exec()` is synchronous, but Dumbo's execution API is async. The adapter should stay async at Dumbo boundaries while consuming cursors synchronously internally.
- Transaction semantics are not SQL-statement based. Any implementation that emits `BEGIN` or `SAVEPOINT` through `exec()` is wrong for this driver.
- `rowsWritten` is Cloudflare billing/write-count oriented and may include index writes. For Dumbo command row counts, verify real behavior against simple DML before relying on it for optimistic concurrency.
- Raw `SqlStorage` can execute SQL but cannot provide `transaction`; transaction support should require `DurableObjectStorage`.
- Pongo optimistic concurrency may rely on precise affected-row counts. Include specific tests before considering full support complete.
