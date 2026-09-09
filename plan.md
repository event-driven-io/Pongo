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
- Local development and tests should use Cloudflare Workers Vitest integration for Durable Object SQLite behavior. Existing D1 tests can get a `D1Database` handle in Node through the Cloudflare Workers runtime, but Durable Object SQLite storage is only available as `ctx.storage`/`state.storage` inside the Durable Object runtime. Use `@cloudflare/vitest-plugin` plus `runInDurableObject()` for real Durable Object SQLite integration tests.

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

Cloudflare Workers Vitest runtime result (workerd 1.20260831.1):

- Nested `storage.transaction(async () => ...)` calls commit both outer and inner writes when both callbacks succeed.
- If an inner transaction throws and the outer callback catches the error, workerd rolls back only the inner writes and allows the outer transaction to continue and commit.
- If the inner transaction succeeds but the outer callback later throws, workerd rolls back both outer and inner writes.
- Dumbo can therefore map opted-in nested transactions to nested `storage.transaction()` calls without emitting SQL savepoint statements. Keep Dumbo's established `allowNestedTransactions` contract: nesting is rejected by default and enabled explicitly.

## Cloudflare Test Tooling Decision

Use Cloudflare's Workers Vitest integration as a permanent test target for Durable Object SQLite behavior, not a temporary harness.

The chosen setup is based on Cloudflare's own `workers-sdk` Durable Object Vitest fixture and current docs. Third-party OSS examples were reviewed, but only Cloudflare's own fixtures are treated as authoritative. Larger projects such as `emdash-cms/emdash` are useful sanity checks for `@cloudflare/vitest-plugin` usage, but they are not Durable Object SQLite role models. Small repos found through GitHub code search are not used as precedent.

- Cloudflare runtime integration tests use `@cloudflare/vitest-plugin` with `cloudflareTest({ wrangler: { configPath } })`.
- Tests import `env` from `cloudflare:workers` and `runInDurableObject()` from `cloudflare:test`.
- The Wrangler config declares a SQLite-backed Durable Object with `new_sqlite_classes`.
- Binding/environment and compatibility-date-matched runtime types come from `wrangler types`, checked in as `worker-configuration.d.ts`.
- `cloudflare:test` helper types come from `@cloudflare/vitest-plugin/types` in the Cloudflare-only TypeScript project.
- Durable Object SQLite specs stay colocated in the Dumbo/Pongo `durableObject` directories, matching the D1/sqlite3 test structure. Runtime ownership is path-based: the Cloudflare Vitest, TypeScript, and ESLint projects select `*.int.spec.ts`/`*.e2e.spec.ts` under those known directories. Filenames use the conventional repository suffixes and do not repeat the runtime as `.cloudflare.*`.
- The Dumbo package TypeScript project excludes the Cloudflare runtime-only specs and test Worker. Those files are not package source and require Cloudflare runtime module resolution.
- Cloudflare runtime files are isolated in the shared `src/tsconfig.cloudflare.json` project so workerd globals do not conflict with the repository's Node globals. The root `npm run build:ts` command invokes both the normal repository project and this Cloudflare project in one `tsc -b` command; developers do not need a second typecheck command.
- The root Vitest configuration includes the shared `src/vitest.cloudflare.config.ts` as a normal project. Therefore the standard integration and e2e commands run the appropriate Cloudflare Durable Object specs alongside the repository's other projects. A targeted Cloudflare command is only an iteration/debugging aid, not an additional manually remembered gate.
- ESLint uses the normal repo tsconfig by default and a file-specific override for colocated Cloudflare runtime specs/test Worker. Do not add `@cloudflare/vitest-plugin/types` globally to the monorepo lint tsconfig.
- Do not add hand-written `declare module 'cloudflare:workers'` or `declare module 'cloudflare:test'` shims. If an ambient extension is needed, use Cloudflare's documented narrow `ProvidedEnv extends Env` shape only; do not redeclare modules, classes, or helper functions.

Current accepted test-tooling files:

- `src/vitest.cloudflare.config.ts`: shared Cloudflare-specific Vitest project using `cloudflareTest`, covering runtime specs by their Dumbo/Pongo `durableObject` paths and using Dumbo's Wrangler test Worker configuration.
- `src/packages/dumbo/wrangler.durable-object-sqlite.jsonc`: test Worker config with a SQLite-backed Durable Object binding.
- `src/packages/dumbo/worker-configuration.d.ts`: generated binding, environment, and runtime types from Wrangler, matched to the test Worker's compatibility date.
- `src/tsconfig.cloudflare.json`: typechecks the `*.int.spec.ts`/`*.e2e.spec.ts` files under the Dumbo/Pongo `durableObject` runtime-test paths plus the tiny test Worker.
- `src/eslint.config.mjs`: keeps the normal repo tsconfig as default and uses a path-based parser-project override for Durable Object runtime specs/test Worker.

The normal package and Cloudflare test-runtime files must remain separate TypeScript projects because they require incompatible Node and workerd ambient globals. They are nevertheless wired into the same standard root build command. This is not a temporary bypass or an untyped exclusion.

Wrangler is a direct root development dependency because generated types are a checked-in build input. Wrangler 4.128.0 generates runtime types with workerd 1.20260831.1 for the Worker compatibility date 2026-08-31. `@cloudflare/vitest-plugin` 1.1.3, Wrangler 4.128.0, and the exact development dependency `@cloudflare/workers-types` 5.20260831.1 resolve to one compatible dependency tree without npm overrides. Dumbo and Pongo expose the matching optional peer range `^5.20260831.1`. Run `npm run types:cloudflare` only after changing the Wrangler config, bindings, migrations, or compatibility date. CI runs `npm run types:cloudflare:check` on every build to reject stale generated types. Ordinary driver implementation changes require only the standard build and test commands. Do not invoke Wrangler through `@cloudflare/vitest-plugin`'s private `node_modules` tree or use npm peer-dependency overrides.

Rejected alternatives:

- Fake `DurableObjectStorage`/`SqlStorage` in integration tests: rejected because it does not test Cloudflare runtime behavior.
- Plain Miniflare RPC facade as the primary Dumbo transaction harness: rejected for transactions because Dumbo needs to be tested against real `DurableObjectStorage.transaction(async)`, not a Node-side facade. It can be reconsidered only for non-transaction black-box tests if it removes no runtime coverage.
- Cloudflare `createTestHarness()` as the primary Dumbo driver harness: rejected for Phase 1 because it exposes a test storage handle or Worker HTTP surface, not the exact `state.storage` object passed to the driver. It remains useful later for Pongo/Worker-level black-box integration.

## Target Design

Use a new Dumbo adapter under:

`src/packages/dumbo/src/storage/sqlite/durableObject`

Public names:

- Driver type: `SQLite:cloudflareDurableObjectSQLite`
- Client: `cloudflareDurableObjectSQLiteClient`
- Connection: `cloudflareDurableObjectSQLiteConnection`
- Pool: `cloudflareDurableObjectSQLitePool`
- Dumbo driver: `cloudflareDurableObjectSQLiteDumboDriver`
- Pongo driver: `cloudflareDurableObjectSQLiteDriver` and exported alias `pongoDriver` only from a dedicated module if needed.

The adapter must accept full ambient `DurableObjectStorage`, because every constructed driver must support transactions. Durable Object SQLite cannot be opened outside a Durable Object like a normal database. The pool should be a singleton/ambient pool, similar to D1, with `storage`, a compatible client, or a compatible connection as its source.

Recommended options:

```ts
type DurableObjectSQLiteClientOptions = {
  storage: DurableObjectStorage;
  serializer: JSONSerializer;
};
```

Require `storage` as the public runtime option. In normal Cloudflare Durable Object code, users have `ctx.storage`, SQL is available at `ctx.storage.sql`, and transactions are available at `ctx.storage.transaction()`. Do not accept raw `SqlStorage`: it would create a partially capable driver whose execution methods work but whose unified transaction API fails only at runtime.

Agreed transaction design:

- Keep Dumbo and Pongo public APIs async. Do not add a public sync transaction API for this driver.
- Use `storage.transaction(async () => userCallback(tx))` for Dumbo `withTransaction`.
- Do not use `storage.transactionSync()` in this driver implementation. The PoC validated async `storage.transaction(async () => ...)`, and existing Dumbo/Pongo callers rely on async callbacks. Mixing in sync transaction execution would create a second transaction model inside a unified async driver.
- Adapter-owned atomic operations such as `batchCommand` should also use async `storage.transaction(async () => ...)` when full `storage` is available. This keeps one transaction path for the driver and matches the PoC-backed design.
- Do not emit SQL transaction statements through `sql.exec()`.
- Inside every query/command method, call `sql.exec(...)` and immediately consume the cursor with `.toArray()` before any `await`.
- Every client requires full `storage: ctx.storage`, so query, command, batch, and transaction APIs are always available. Derive the synchronous SQL handle internally from `storage.sql`.

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
6. Run the root `npm run build:ts` command. It typechecks the normal repository projects and the isolated Cloudflare test-runtime project in one build invocation.
7. For Cloudflare Durable Object SQLite phases, run the relevant integration tests through the standard `npm run test:int` gate. A targeted `npm run test:int:cloudflare` run is useful while iterating but never substitutes for the standard integration gate.
8. Do not mark a prompt complete in `todo.md` until tests, lint/fix, and build have passed. If a required integration test cannot run because of a real environment/tooling limitation, document the blocker in `todo.md` and leave that prompt or verification item incomplete rather than treating it as done.

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
7. For `command`, fully consume the statement cursor, then synchronously execute `SELECT changes() AS changes` before any `await`; return that logical SQLite affected-row count with any `RETURNING` rows. Do not use billing-oriented `cursor.rowsWritten` as Dumbo's affected-row count because index writes can inflate it.
8. For `batchCommand`, execute statements sequentially inside async `storage.transaction(async () => ...)`.
9. Support `assertChanges` the same way as D1/sqlite3 by throwing `BatchCommandNoChangesError(statementIndex)` when a batch command reports zero writes.
10. Implement Dumbo transactions with `storage.transaction(async () => ...)`, not SQL transaction statements.
11. Preserve Dumbo's `allowNestedTransactions` contract. Reject nested/re-entrant Dumbo transactions by default; when explicitly enabled, map each nested scope to native nested `storage.transaction(async)` and rely on the workerd-verified inner/outer rollback behavior. Never emulate this with SQL savepoint statements.
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

Primary DO target: `src/packages/dumbo/src/storage/sqlite/durableObject/connections/connection.generic.int.spec.ts`

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

- Use Cloudflare Workers Vitest runtime SQLite Durable Objects to prove `SELECT changes()` reports logical affected rows even when indexes make `rowsWritten` larger.
- Verify cursor-sensitive behavior through real Cloudflare runtime tests where possible. If synchronous cursor-consumption timing cannot be observed without replacing Cloudflare runtime objects, enforce it by production-code review and document the limitation instead of adding fake integration coverage.

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

- Use Cloudflare Workers Vitest runtime Durable Object SQL to verify the shared SQLite formatter against Cloudflare `SqlStorage.exec`.
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
- Add Durable Object-specific cases: async `storage.transaction(async () => ...)`, rollback across an `await Promise.resolve()`, commit across an `await Promise.resolve()`, and proof that transaction-control SQL is never emitted.
- Transaction mode SQL (`DEFERRED`, `IMMEDIATE`, `EXCLUSIVE`) cannot be emitted through `SqlStorage.exec`. Either ignore/reject those options with explicit tests, or map them only if Cloudflare exposes a safe non-SQL API.
- Native nested transaction behavior is verified against real workerd storage. Mirror sqlite3's opt-in/default-rejection contract, but implement enabled nesting with nested `storage.transaction()` calls rather than SQL savepoints.

Additional Durable Object transaction tests:

- `storage.transaction(async () => ...)` rolls back writes before and after `await Promise.resolve()` when the callback throws. This is the PoC-backed design decision and must be in `durableObject/transactions/transactions.int.spec.ts`.
- `storage.transaction(async () => ...)` commits writes before and after `await Promise.resolve()` when the callback returns successfully.
- The public options require full storage, so there is no execution-only client or delayed transaction-capability failure.
- `transactionSync` is never called. Enforce this with source review; do not introduce fake Durable Object storage merely to spy on runtime internals.
- SQL text sent to `ctx.storage.sql.exec()` never contains `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, or `RELEASE`. Enforce this with source review and public transaction behavior tests; do not introduce fake `SqlStorage` in integration tests.
- Test both sides of Dumbo's nesting contract against real workerd: default/explicit-false rejection, plus opted-in nested commit, caught-inner rollback, and outer rollback after inner success.

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

| Durable Object SQLite test file                                                                                | Primary reference                                                                                         | Why                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `durableObject/connections/connection.int.spec.ts`                                                             | `d1/connections/connection.int.spec.ts`; `sqlite3/connections/connection.int.spec.ts`                     | Connection/pool usage is closest to D1 because both are Cloudflare/runtime-provided handles, but sqlite3 has broader ambient connection cases.                                         |
| `durableObject/connections/connection.generic.int.spec.ts`                                                     | `d1/connections/connection.int.generic.spec.ts`; `sqlite3/connections/connection.int.generic.spec.ts`     | Generic `dumbo({ driverType })` behavior once the driver is registered.                                                                                                                |
| `durableObject/execute/batchCommand.int.spec.ts`                                                               | `d1/execute/batchCommand.int.spec.ts`; `sqlite3/execute/batchCommand.int.spec.ts`                         | Batch command and `assertChanges` behavior must match both D1 error shape and sqlite3 stop-after-conflict coverage.                                                                    |
| `durableObject/execute/changesCount.int.spec.ts`                                                               | `sqlite3/execute/changesCount.int.spec.ts`                                                                | D1 does not cover enough affected-row cases. Verify INSERT, multi-row INSERT, UPDATE, DELETE, no-op, RETURNING, and indexed writes using synchronous SQLite `changes()`, not billing-oriented `rowsWritten`. |
| `durableObject/formatter/sqlFormatter.int.spec.ts`                                                             | `d1/formatter/sqlFormatter.int.spec.ts`; `sqlite3/formatter/sqlFormatter.int.spec.ts`                     | Formatter behavior should match shared SQLite formatting through a real runtime database.                                                                                              |
| `durableObject/transactions/transactions.int.spec.ts`                                                          | `sqlite3/transactions/transactions.int.spec.ts`; D1 transaction tests only for Cloudflare option contrast | sqlite3 is the baseline for actual commit/rollback behavior. Durable Object SQLite should rollback on thrown async callbacks, unlike D1.                                               |
| `durableObject/transactions/transactionErrorSuppression.int.spec.ts`                                           | `sqlite3/transactions/transactionErrorSuppression.int.spec.ts`                                            | Preserve original callback errors; adapt only if Cloudflare runtime does not expose a reliable rollback-failure trigger.                                                               |
| `durableObject/pool/cloudflareDurableObjectSQLitePool.unit.spec.ts`                                            | D1/sqlite3 pool option validation                                                                         | Unit coverage for a missing storage/client/connection configuration; keep this behavior in the pool folder.                                                                            |
| `durableObject/transactions/transactions.int.spec.ts`                                                          | sqlite3 transaction state/error behavior                                                                  | Cover transaction-before-active and storage-required errors through the real runtime pool; do not construct casted fake clients or connections.                                        |
| `durableObject/errors/errorMapper.unit.spec.ts` and `durableObject/execute/errorMapper.int.spec.ts`            | D1 error mapper specs and sqlite3 error mapper specs                                                      | Add if Cloudflare Durable Object errors need distinct mapping; otherwise document reuse of shared SQLite mapping and skip dedicated files.                                             |

Durable Object specifics that every relevant test file must account for:

- Use Cloudflare Workers Vitest runtime SQLite Durable Objects for integration tests, configured with a tiny test Durable Object worker, a Wrangler config with `new_sqlite_classes`, and `runInDurableObject()` to access real `state.storage`.
- Run Dumbo code inside the Durable Object where `ctx.storage` exists. Do not fake `DurableObjectStorage` for integration behavior.
- Keep SQL cursor consumption synchronous inside the driver. Do not replace Cloudflare runtime objects in integration tests just to observe cursor internals.
- Never emit `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`, or `RELEASE` through `ctx.storage.sql.exec()`.
- Transactions should mirror sqlite3 outcomes for commit/rollback where Cloudflare supports them, plus the Durable Object-specific case of rollback across `await Promise.resolve()`.
- All runtime tests use full `storage`; raw `SqlStorage` is not a supported construction mode because it cannot provide the unified transaction contract.

Keep coverage aligned with comparable D1/sqlite3 tests. If D1 or sqlite3 has a relevant connection, execution, transaction, export, or type test, Durable Object SQLite should get the same behavioral class of test unless the difference is inherent to Durable Object storage and documented in the spec file and `todo.md`.

Run from `src` for every Dumbo Cloudflare phase:

- `npm run fix`
- `npm run build:ts`
- `npx vitest run --config vitest.cloudflare.config.ts --reporter verbose`
- targeted Durable Object SQLite unit tests
- targeted Durable Object SQLite integration tests
- targeted Vitest tests for the new adapter
- existing D1 targeted tests to protect Cloudflare exports

Before completing the phase, run the standard `npm run test:int` gate; it includes the Cloudflare project through the root Vitest configuration. Regenerate Cloudflare types only when the Wrangler configuration, bindings, migrations, or compatibility date changes. CI always runs `npm run types:cloudflare:check` to detect drift.

## Pongo Implementation Blueprint

After Dumbo is green:

1. Add `src/packages/pongo/src/storage/sqlite/durableObject`.
2. Mirror `src/packages/pongo/src/storage/sqlite/d1/index.ts`, replacing D1-specific names/options with Durable Object SQLite names/options.
3. Use `sqliteSQLBuilder` exactly as D1 does.
4. Accept exactly one transaction-capable source: full `storage`, a Durable Object SQLite `connection`, or a Durable Object SQLite `pool`. Do not expose raw `SqlStorage` or a raw client through Pongo.
5. Throw `PongoError('Durable Object SQLite storage, connection, or pool is required')` when no usable ambient handle exists.
6. Export from `src/packages/pongo/src/cloudflare.ts`.
7. Register `SQLite:cloudflareDurableObjectSQLite` in `src/packages/pongo/src/index.ts` so lazy loading works through the existing `cloudflare` entry point.
8. Add type tests mirroring D1.
9. Add focused Pongo connection and transaction tests with Cloudflare Workers Vitest runtime storage.
10. Add real-workerd session transaction tests before changing transaction code. Keep Pongo's existing, driver-agnostic session coordinator unchanged: it enlists through Dumbo's unified async `transaction().begin()`, `execute`, `commit()`, and `rollback()` contract. Implement that complete lifecycle contract in the Dumbo Durable Object adapter by bridging it to a pending async `storage.transaction()` callback. Do not add a Pongo driver branch or a second transaction coordinator.
11. Cover both `session.withTransaction()` and the explicit `startTransaction()` / `commitTransaction()` / `abortTransaction()` flow against real Durable Object storage, including rollback after an `await` and original error propagation.
12. Add a full Pongo e2e suite by mirroring the D1 suite once the Workers runtime setup is proven.

## Right-Sized Implementation Chunks

### Phase 1 / Prompt 1: Dumbo Cloudflare Test Target And First Behavior Slice [Completed 2026-09-02]

Reconcile the current code into a real behavior slice. Tests should be added gradually as implementation is built, and each test should describe how the driver works from a caller/runtime perspective. Do not write tests that merely assert stubs, placeholders, function existence, or internal implementation shape.

Because the current code already exposes connection, pool, executor, and transaction modules, Phase 1 must either implement the exposed behavior with matching tests or narrow/remove the exposed placeholder code until a later phase implements it.

Minimum acceptable Phase 1 behavior:

- Establish the permanent Cloudflare Workers Vitest project setup for colocated Durable Object SQLite specs: `vitest.cloudflare.config.ts`, `wrangler.durable-object-sqlite.jsonc`, generated `worker-configuration.d.ts`, and `tsconfig.cloudflare.json`.
- Keep this setup non-invasive: no hand-written `cloudflare:*` module declarations, no global `@cloudflare/vitest-plugin/types` in the monorepo lint tsconfig, and no fake storage.
- Generate full compatibility-date-matched runtime and binding types with Wrangler; do not use `--include-runtime=false` for this concrete test Worker.
- Implement real non-transaction SQL execution through Cloudflare `SqlStorage.exec()`.
- Implement connection and pool enough to run real SQL inside a Cloudflare Workers Vitest SQLite-backed Durable Object.
- Implement the exposed async transaction behavior with `storage.transaction(async)`, including commit, rollback, callback result, abort, default nested/re-entrant rejection, explicitly enabled native nesting, and independent concurrent transaction serialization.
- Add `durableObject/connections/connection.int.spec.ts`, mirroring applicable runtime-handle cases from D1 `connections/connection.int.spec.ts`.
- Add `durableObject/execute/changesCount.int.spec.ts`, mirroring sqlite3 `execute/changesCount.int.spec.ts` for real INSERT, multi-row INSERT, UPDATE, DELETE, no-op, RETURNING, and sequential commands.
- Add `durableObject/execute/batchCommand.int.spec.ts` if `batchCommand` is implemented in this phase, mirroring D1/sqlite3 `assertChanges` behavior.
- Add `durableObject/execute/errorMapper.int.spec.ts`, mirroring D1/sqlite3 error categories against errors thrown by real workerd SQLite.
- Add `durableObject/transactions/transactions.int.spec.ts`, mirroring applicable sqlite3 transaction outcomes and adding the Durable Object-specific async/concurrency cases.
- Keep tests in matching subfolders.
- Run `npm run fix`, the unified `npm run build:ts`, targeted Phase 1 Cloudflare integration tests, and the standard integration gate before marking complete.

### Chunk 2: Dumbo client query/command execution [Completed within Phase 1]

Add Cloudflare Workers runtime tests first, mirroring D1/sqlite3 execution coverage, then implement `cloudflareDurableObjectSQLiteClient` for `query`, `batchQuery`, `command`, and `batchCommand` without transaction factory integration.

### Chunk 3: Dumbo connection and pool [Completed within Phase 1]

Add connection/pool tests first, mirroring D1 where practical, then wire client into a `cloudflareDurableObjectSQLiteConnection` and `cloudflareDurableObjectSQLitePool`, requiring full `storage`, a compatible client, or a compatible connection. Cover ambient connection, singleton pool behavior, and missing option behavior.

### Chunk 4: Dumbo transaction semantics [Completed within Phase 1]

Add transaction tests first, then add Durable Object specific transaction factory using async `storage.transaction()`. Cover callback result, error propagation, nested behavior, and no transaction SQL emission.

### Chunk 5: Dumbo driver registration and exports [Completed 2026-09-04]

Add driver registration/export/type tests first, then add `cloudflareDurableObjectSQLiteDumboDriver`, register it, export it from `cloudflare.ts`, and build.

### Chunk 6: Dumbo generic driver and formatter integration [Completed 2026-09-04]

Add Cloudflare Workers Vitest Durable Object SQLite generic Dumbo driver and formatter integration tests in the matching subfolders. Do not add top-level smoke specs.

### Chunk 7: Pongo driver wrapper [Completed 2026-09-04]

Add Pongo driver/type tests first, then add Pongo Durable Object SQLite driver by mirroring D1 and using the new Dumbo pool/driver.

### Chunk 8: Pongo connection and full e2e tests [Completed 2026-09-07]

Add Pongo connection tests, session transaction tests, and a full D1-equivalent e2e suite for the new driver before or alongside the behavior they exercise. Pongo's session implementation must remain unchanged and use Dumbo's unified explicit lifecycle contract; the Durable Object adapter must implement that contract without a driver-specific Pongo branch.

### Chunk 9: Final export/build verification

Verify package entry points, lazy driver loading, TypeScript build, `npm run fix`, targeted unit tests, targeted integration tests, relevant D1 regression tests, and update docs or README snippets if the repo expects driver lists there.

## Code-Generation Prompts

### Prompt 1: Dumbo Cloudflare Test Target And First Behavior Slice [Completed 2026-09-02]

```text
You are working in /home/oskar/Repos/Pongo. Complete Phase 1 / Prompt 1 as the first real Dumbo Cloudflare Durable Object SQLite behavioral slice. Do not add tests for skeletons, stubs, function existence, or implementation details.

Use the permanent Cloudflare Workers Vitest setup:
- Keep tests colocated under src/packages/dumbo/src/storage/sqlite/durableObject/**.
- Use the shared `vitest.cloudflare.config.ts` with `@cloudflare/vitest-plugin`.
- Use packages/dumbo/wrangler.durable-object-sqlite.jsonc with a SQLite-backed Durable Object binding and new_sqlite_classes migration.
- Use generated packages/dumbo/worker-configuration.d.ts for binding/env types.
- Generate full runtime types (do not pass --include-runtime=false). The checked-in result is verified by the CI `npm run types:cloudflare:check` step.
- Use the shared `tsconfig.cloudflare.json` for Cloudflare runtime typechecking.
- Do not add hand-written declare module shims for cloudflare:workers or cloudflare:test.
- Do not add @cloudflare/vitest-plugin/types globally to src/tsconfig.eslint.json.
- Keep Cloudflare runtime-only specs/test Worker out of the Dumbo package project; the isolated Cloudflare project is included automatically by the root npm run build:ts command.

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
- Use Cloudflare Workers Vitest SQLite-backed Durable Objects for integration tests. Run Dumbo code inside the Durable Object where `state.storage` exists.
- Test behavior, not implementation shape.

Implementation:
- Implement `cloudflareDurableObjectSQLiteClient` around `SqlStorage.exec()`.
- Require full `storage` and derive `SqlStorage` from `storage.sql`.
- Consume every cursor synchronously with `.toArray()` inside the method before any await boundary.
- Return query rows and rowCount; command rowCount must use synchronous SQLite `changes()` and be verified with indexed writes in real workerd.
- Implement connection and pool only to the extent required by the behavioral tests.
- Implement the already-exposed async transaction API with `storage.transaction(async)`; do not use `transactionSync` or transaction-control SQL.
- Cover commit and rollback across `await`, callback results, errors, aborts, default nested/re-entrant rejection, explicitly enabled native nesting, and independent concurrent transaction serialization in the real Cloudflare runtime.
- Do not export from src/packages/dumbo/src/cloudflare.ts yet unless this phase also includes driver registration tests.

Run from src:
- npm run fix
- npm run build:ts
- npm run test:int:cloudflare -- src/storage/sqlite/durableObject/connections/connection.int.spec.ts
- npm run test:int:cloudflare -- src/storage/sqlite/durableObject/execute/changesCount.int.spec.ts
- npm run test:int:cloudflare -- src/storage/sqlite/durableObject/execute/batchCommand.int.spec.ts if added
- npm run test:int before completing the phase

Before marking Phase 1 complete, run the mandatory review gate and record the result in todo.md. Phase 1 must not pass if it only adds tests for unimplemented stubs; either implement a real tested vertical slice or narrow/remove exposed placeholder behavior.
```

### Prompt 2: Dumbo Client Execution [Completed within Phase 1]

```text
Implement cloudflareDurableObjectSQLiteClient around Cloudflare SqlStorage.

Read:
- src/packages/dumbo/src/storage/sqlite/d1/connections/d1Client.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/connections/connection.ts
- src/packages/dumbo/src/storage/sqlite/core/execute/execute.ts
- src/packages/dumbo/src/storage/sqlite/d1/execute/batchCommand.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/execute/batchCommand.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/execute/changesCount.int.spec.ts

Behavior:
- Require full Durable Object storage. Do not expose a raw-SQL construction mode that cannot support transactions.
- Use sqliteFormatter.format(sql, { serializer }) for query text and params.
- Call sqlStorage.exec(query, ...params).
- Consume cursor immediately using toArray().
- query returns rowCount = rows.length and rows.
- batchQuery executes each query sequentially and returns each result.
- command fully consumes the statement cursor, synchronously executes `SELECT changes() AS changes` before any await, and returns the logical affected-row count together with any returned rows.
- batchCommand executes sequentially. If options.assertChanges is true and rowCount is 0, throw BatchCommandNoChangesError with the current index and stop.

Add tests before implementation:
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/execute/batchCommand.int.spec.ts`, mirroring both D1 and sqlite3 assertChanges cases.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/execute/changesCount.int.spec.ts`, mirroring sqlite3 changes-count cases and proving indexed writes still return SQLite's logical `changes()` count rather than Cloudflare's billing write count.
- Do not use fake `SqlStorage`/`DurableObjectStorage` in integration tests. If a cursor timing detail cannot be observed through the Workers runtime, document it and keep the production code simple enough for source review.

Keep tests local to the behavior folder. Run the targeted tests and Dumbo TypeScript build.

Run from src:
- npm run fix
- npm run build:ts
- targeted Durable Object SQLite unit tests
- targeted Durable Object SQLite integration tests if any exist after this prompt, otherwise the nearest relevant D1/sqlite3 execution integration tests
- npm run test:int before completing the phase
```

### Prompt 3: Dumbo Connection And Pool [Completed within Phase 1]

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

The pool should be singleton/ambient because Durable Object storage is provided by the runtime. It should require exactly one of storage, client, or connection, consistent with D1 ambient behavior where practical.

Use JSONSerializer.from(options) in the pool. Use sqliteAmbientClientConnection if it fits; otherwise use createAmbientConnection directly. Missing storage/client/connection should throw InvalidOperationError with a clear Durable Object SQLite message.

Add tests before implementation:
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/connections/connection.int.spec.ts`, mirroring D1 connection tests because both D1 and Durable Object SQLite are Cloudflare runtime handles.
- Use Cloudflare Workers Vitest and construct the pool/connection inside `runInDurableObject()` with full `state.storage`.
- Cover `SELECT 1`, construction from storage, ambient client, ambient connected connection, ambient not-connected connection, `withConnection`, and singleton behavior where it applies. Do not add a raw `SqlStorage` construction mode because it would violate the always-transaction-capable driver contract.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/pool/singletonPool.unit.spec.ts` only if Durable Object pool queueing/reentrancy needs local unit coverage comparable to sqlite3's singleton pool tests.
- Do not use fake storage for integration behavior. Durable Object SQLite integration behavior must run through the Workers runtime or be marked blocked with a reason.

Run from src:
- npm run fix
- npm run build:ts
- npm run test:int:cloudflare -- src/storage/sqlite/durableObject/connections/connection.int.spec.ts
- any added durableObject pool unit tests
- npm run test:int before completing the phase
```

### Prompt 4: Dumbo Durable Object Transactions [Callback support completed within Phase 1; explicit lifecycle completed in Prompt 8]

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
- Implements Dumbo's complete async transaction contract: callback `withTransaction()` plus explicit `begin()`, `execute`, `commit()`, and `rollback()` lifecycle methods.
- Bridges explicit lifecycle calls to Cloudflare by opening `storage.transaction(async () => ...)` in `begin()`, keeping that callback pending while caller SQL executes, resolving it in `commit()`, and rejecting it in `rollback()`.
- Does not emit BEGIN, COMMIT, ROLLBACK, SAVEPOINT, or RELEASE SQL.
- Exposes transaction.execute using the same Durable Object SQLite client against transaction-active storage.
- Propagates callback results and errors through Dumbo's withTransaction flow.
- Preserves Dumbo's `allowNestedTransactions` option: reject nesting by default and, when enabled, use nested async `storage.transaction()` calls. Real workerd tests must prove inner commit, caught-inner rollback, and outer rollback behavior. Do not emit SQL savepoint statements.

Add tests before implementation:
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/transactions/transactions.int.spec.ts`, using Cloudflare Workers Vitest runtime SQLite Durable Objects.
- Mirror sqlite3 transaction outcomes where Durable Object storage supports them: commit persists rows, thrown callback rolls back rows, nesting is rejected by default, and explicitly enabled nested scopes use the workerd-verified rollback behavior.
- Mirror Dumbo's explicit lifecycle behavior as well: commit and rollback persist the correct outcome across `await`, SQL cannot execute before `begin()` or after completion, rollback does not replace the caller's original error, and nested lifecycle calls follow the shared `allowNestedTransactions` semantics.
- Add the Durable Object-specific rollback-across-await case: insert before `await Promise.resolve()`, insert after it, throw, and assert neither row exists.
- Prove transaction behavior through Cloudflare runtime tests and verify transaction-control SQL is not emitted through source review. Do not replace `SqlStorage` with a fake in integration tests.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/transactions/transactionErrorSuppression.int.spec.ts` mirroring sqlite3 if a reliable Cloudflare rollback-failure condition can be created; otherwise document why this case does not apply.
- Include D1 transaction tests only as contrast for Cloudflare-specific unsupported transaction SQL/session behavior; do not copy D1's non-rollback expectations.

Run from src:
- npm run fix
- npm run build:ts
- npm run test:int:cloudflare -- src/storage/sqlite/durableObject/transactions/transactions.int.spec.ts
- npm run test:int:cloudflare -- src/storage/sqlite/durableObject/transactions/transactionErrorSuppression.int.spec.ts if added
- npm run test:int before completing the phase
```

### Prompt 5: Dumbo Driver Registration And Cloudflare Export [Completed 2026-09-04]

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
- canHandle should return true for driverType 'SQLite:cloudflareDurableObjectSQLite' and storage/connection/client options as appropriate.

Register with dumboDatabaseDriverRegistry on import. Export the durableObject adapter from src/packages/dumbo/src/cloudflare.ts. Add type tests for DumboConnectionOptions similar to D1. Run Dumbo TypeScript build and targeted Cloudflare/Durable Object tests.

Run from src:
- npm run fix
- npm run build:ts
- targeted Durable Object SQLite unit/type tests
- targeted Cloudflare export/D1 regression tests touched by export changes
- npm run test:int before completing the phase
```

### Prompt 6: Dumbo Generic Driver And Formatter Integration Tests [Completed 2026-09-04]

```text
Add the remaining runtime-backed Dumbo integration tests for Durable Object SQLite that require the driver to be registered/exported.

Read:
- src/packages/dumbo/src/storage/sqlite/d1/connections/connection.int.generic.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/connections/connection.int.generic.spec.ts
- src/packages/dumbo/src/storage/sqlite/d1/formatter/sqlFormatter.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/formatter/sqlFormatter.int.spec.ts

Use the Cloudflare Workers Vitest SQLite-backed Durable Object setup from the earlier connection and transaction tests.

Add tests before implementation changes:
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/connections/connection.generic.int.spec.ts`, mirroring D1 generic Dumbo driver integration through `dumbo({ driverType: 'SQLite:cloudflareDurableObjectSQLite', storage: ctx.storage })`. The terminal `.int.spec.ts` category keeps it discoverable by the standard integration command and matches PostgreSQL's ordering.
- Add `src/packages/dumbo/src/storage/sqlite/durableObject/formatter/sqlFormatter.int.spec.ts`, mirroring D1/sqlite3 formatter integration through the Durable Object driver.
- Keep tests in the matching subfolders; do not add top-level smoke specs.

Run from src:
- npm run fix
- npm run build:ts
- npm run test:int:cloudflare -- src/storage/sqlite/durableObject/connections/connection.generic.int.spec.ts
- npm run test:int:cloudflare -- src/storage/sqlite/durableObject/formatter/sqlFormatter.int.spec.ts
- npm run test:int before completing the phase
```

### Prompt 7: Pongo Durable Object SQLite Driver [Completed 2026-09-04]

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
- Define options with an unambiguous source union so storage, connection, and pool cannot conflict; every source must retain full transaction capability.
- databaseFactory should use withPongoTransactionOptions and PongoDatabase like D1 does.
- Use sqliteSQLBuilder.
- Throw PongoError if no storage/connection/pool is available.
- Register with pongoDriverRegistry.
- Export aliases cloudflareDurableObjectSQLiteDriver and pongoDriver as appropriate.

Update src/packages/pongo/src/cloudflare.ts to export it. Update src/packages/pongo/src/index.ts lazy registration for 'SQLite:cloudflareDurableObjectSQLite' through the cloudflare entry. Add type tests similar to D1. Run Pongo TypeScript build and targeted type tests.

Run from src:
- npm run fix
- npm run build:ts
- targeted Pongo Durable Object SQLite unit/type tests
- targeted Pongo integration tests for construction/connection if available
- npm run test:int before completing the phase
```

### Prompt 8: Pongo Durable Object SQLite Full Tests [Completed 2026-09-07]

```text
Add full Pongo tests for the Durable Object SQLite driver.

Read:
- src/packages/pongo/src/e2e/postgresql/pg/postgres.e2e.spec.ts
- src/packages/pongo/src/e2e/postgresql/pg/postgres.connections.int.spec.ts
- src/packages/pongo/src/e2e/sqlite/d1/d1.connections.int.spec.ts
- src/packages/pongo/src/e2e/sqlite/d1/d1.e2e.spec.ts
- src/packages/pongo/src/e2e/sqlite/sqlite3/sqlite3.connections.int.spec.ts
- src/packages/pongo/src/e2e/sqlite/sqlite3/sqlite3.e2e.spec.ts
- src/packages/pongo/src/storage/sqlite/d1/versioningCache.int.spec.ts
- src/packages/pongo/src/storage/sqlite/sqlite3/autoMigration.int.spec.ts
- src/packages/pongo/src/storage/sqlite/sqlite3/migrations.int.spec.ts
- src/packages/pongo/src/storage/sqlite/sqlite3/rename.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/sqlite3/transactions/transactions.int.spec.ts
- src/packages/dumbo/src/storage/sqlite/durableObject/transactions/transactions.int.spec.ts

Start by reusing the Cloudflare Workers Vitest runtime setup from Dumbo:

- Use the tiny test Durable Object class plus `runInDurableObject()` so Pongo runs against real `state.storage`.
- Do not replace Vitest's normal test API with a custom `it` wrapper or repeat an `inDurableObject` helper around every test. Because `state.storage` is valid only inside `runInDurableObject()`, use Vitest's `aroundEach` hook to keep each test body inside that callback while performing client setup before `runTest()` and cleanup afterward. A plain `beforeEach`/`afterEach` pair cannot keep the test body inside the Durable Object callback.
- If the Workers runtime setup cannot support a case, leave that case blocked in `todo.md` with the reason. Do not replace runtime behavior with fake `SqlStorage`/`DurableObjectStorage` integration tests.

Test:
- Pongo database can be constructed from storage/connection.
- A collection can create schema/migrations through the new driver.
- insertOne/findOne/update/delete smoke path works.
- `db.withTransaction()` commits and rolls back through Dumbo's callback transaction API.
- Add real-workerd Pongo session tests before changing Dumbo lifecycle behavior. Keep the shared Pongo transaction coordinator unchanged; its existing `db.transaction().begin()` enlistment is the unified Dumbo contract that the Durable Object adapter must satisfy.
- `session.withTransaction()` commits on success and rolls back on error against real Durable Object storage, including operations separated by `await`.
- Explicit `session.startTransaction()` followed by `commitTransaction()` or `abortTransaction()` has the same real-runtime behavior.
- Preserve existing sqlite3, D1, and PostgreSQL session transaction behavior; do not add a Durable Object-specific branch, a Pongo-side deferred callback coordinator, transaction-control SQL, or `transactionSync`. Dumbo's Durable Object transaction shell must support `begin`, `commit`, and `rollback` like every unified driver transaction.
- Make `durableObject.e2e.spec.ts` the main full e2e suite, structurally matching the sqlite3/PostgreSQL main suites. Do not use a 319-line smoke suite as the corresponding main driver e2e file or split the mirrored baseline into a misleading `compatibility` file.
- Include every D1 main-suite case plus the three sqlite3/PostgreSQL filter cases missing from D1: top-level `$or`, nested `$and`/`$or`, and top-level `$nor`.
- Keep the full optimistic-concurrency suite aligned test-for-test with PostgreSQL, sqlite3, and D1.
- Add Durable Object integration counterparts for all applicable Pongo SQLite behavior suites: 3 auto-migration cases, 5 migration cases, 14 rename cases, and 6 versioning/cache cases.
- Expand existing-connection coverage with the applicable PostgreSQL/sqlite3 cases not already covered: use a connection obtained from a transaction, nested Pongo transactions on a supplied connection with default options, and explicitly disabled nesting on a supplied connection. Raw-client and savepoint cases are intentionally excluded because Pongo does not accept the raw Durable Object client and this driver does not expose SQL savepoints.
- Audit Dumbo's Durable Object runtime suites against sqlite3 and D1. Retain documented exclusions for file/reader/dual-pool behavior, configurable connection PRAGMAs, transaction modes, readonly transactions, and SQL savepoints. Add any missing public source-validation case; do not claim aggregate test counts as evidence of parity.

Coverage matrix verified on 2026-09-05:

- Main Pongo e2e reference at audit time: `sqlite3.e2e.spec.ts` had 63 runnable static test definitions and `postgres.e2e.spec.ts` had 57 total definitions (53 runnable and 4 skipped). `d1.e2e.spec.ts` and the former Durable Object compatibility file each had the same 60 runnable definitions. The earlier Durable Object main suite had only 9 focused definitions. The completed `durableObject.e2e.spec.ts` suite has 72 runnable definitions: the 60-case D1 body, 3 additional filter cases, and 9 Durable Object-specific cases. The redundant compatibility file was removed.
- Main Pongo e2e additions, referenced directly from `sqlite3.e2e.spec.ts` and `postgres.e2e.spec.ts`: `should find documents with a top-level $or filter`; `should find documents with nested $and and $or filters`; `should find documents with a top-level $nor filter`.
- Pongo auto-migration reference: `storage/sqlite/sqlite3/autoMigration.int.spec.ts`. Add all 3 cases: `None` does not create a collection; `CreateOrUpdate` creates a collection; `CreateOrUpdate` creates a collection declared in a named schema.
- Pongo migration reference: `storage/sqlite/sqlite3/migrations.int.spec.ts`. Add all 5 cases: migrate the whole database through a collection schema; roll back collection-schema migration with an active session; apply default and schema-prefixed migrations in order; record migrations in a configured migration table; migrate mixed event-store and Pongo extension schemas.
- Pongo rename reference: `storage/sqlite/sqlite3/rename.int.spec.ts`. Add all 14 cases: use the renamed table; rename a never-used collection; remove the old physical table; report the new name; stop serving the old name; preserve documents under the new name; rename twice; record rename as a migration; declare create and rename migrations; do not reapply rename; do not rename with auto-migration `None`; roll back rename with an active session; rename in a named schema; resolve the renamed table after client restart/recreation.
- Pongo versioning/cache reference: `storage/sqlite/d1/versioningCache.int.spec.ts`. Add all 6 cases: versioned `_id $in` read; `handle` loads an existing document; `replaceMany` updates by `_id`; `handle` enforces stored-version concurrency; `handle` receives the upcast id/version model; a second cached read returns the correct upcast model.
- Pongo connection reference: `postgres.connections.int.spec.ts`, `sqlite3.connections.int.spec.ts`, and `d1.connections.int.spec.ts`. The current Durable Object suite already covers top-level storage, storage in connection options, supplied-connection reuse/visibility, typed pool use, and declared collection/index migrations. Add the 3 remaining applicable cases: a connection obtained from an active Dumbo transaction; nested Pongo transactions on a supplied connection with default options; explicitly disabled nesting on a supplied connection. Do not duplicate the already-covered supplied-connection behavior.
- Pongo optimistic-concurrency reference: the PostgreSQL, sqlite3, D1, and completed Durable Object optimistic suites have the same 65 static test definitions. Preserve that exact set while using standard Vitest lifecycle handling.
- Dumbo transaction reference: `storage/sqlite/sqlite3/transactions/transactions.int.spec.ts`. The Durable Object suite already covers callback commit/rollback, nested commit and rollback outcomes, default/explicit nesting, same-pool transaction reentry, serialization/non-overlap, abort options, explicit lifecycle state/order, and raw workerd semantics. Add the still-applicable public-driver cases: a root-pool write made inside an active transaction participates in rollback; a root-pool write started from another promise chain while the storage transaction is pending also participates in that workerd transaction and rolls back with it; a failing concurrent transaction does not roll back a successful one after workerd serializes them; `pool.withConnection` can reenter an active transaction; `pool.execute.command` can reenter an active transaction; nested `pool.withConnection` inside `connection.withTransaction` stays in the active transaction; concurrent `withConnection` writes serialize. The second expectation intentionally differs from sqlite3 and is already established at the raw `DurableObjectStorage` level; these additions must prove the behavior through the public driver against real workerd storage.
- Dumbo pool source validation reference: `cloudflareDurableObjectSQLitePool.ts`. Keep the existing missing-source test and add a real-runtime conflicting-sources test for the `sourceCount !== 1` branch. Compile-time source-union tests do not exercise the JavaScript runtime guard.
- Follow-up Dumbo client audit on 2026-09-06: direct `query`, `batchQuery`, and `command` must be declared `async` so formatter and workerd failures reject their promised API instead of escaping synchronously. Cover all three methods through the direct client against real workerd storage.
- Follow-up Dumbo row-count audit on 2026-09-06: SQLite `changes()` retains the previous DML count after DDL. Cover DML followed by DDL for both `command` and `batchCommand`. Determine whether a statement changed rows by comparing synchronous `total_changes()` values around execution, then use `changes()` for the logical top-level row count; do not parse SQL or use Cloudflare's index-inclusive `rowsWritten` value. Workerd rejects changing PRAGMAs after writes and inside `storage.transaction()` with `SQLITE_AUTH`, so do not fabricate a post-DML PRAGMA case; retain the existing independent foreign-key PRAGMA runtime coverage.
- Follow-up Dumbo transaction audit on 2026-09-06: add the two applicable sqlite3 nested-callback cases that were not explicit in the first matrix (multiple sibling nested commits leave the outer transaction usable; an uncaught inner failure propagates and rolls back the outer transaction). Also prove root-pool operations enlist in an explicit lifecycle transaction both in the same flow on commit and from another promise chain on rollback.
- Follow-up source audit on 2026-09-06: test the Dumbo driver's negative `canHandle` branches, reject multiple Pongo Durable Object sources at the JavaScript runtime boundary using real storage/pool values, and prove connection-level transaction options override top-level options consistently with D1.
- Follow-up binding audit on 2026-09-06: remove dead Date/bigint conversion branches and the unchecked `SqlStorageValue` cast. The shared SQLite formatter already maps those values. Explicitly validate the remaining Cloudflare binding types, cover true and false boolean normalization, and reject unsupported formatter output through the async public API.
- Intentionally non-duplicated Pongo suite: `core/cache/collectionCache.int.spec.ts` is one shared driver-independent cache contract suite, not copied per PostgreSQL/sqlite3/D1 driver. Keep it as a shared suite; the Durable Object-specific versioning/cache cases above are still required.
- Intentionally excluded Dumbo cases: sqlite3 filesystem, reader/writer, dual-pool, and configurable PRAGMA behavior do not exist for one ambient Durable Object storage; D1 session/strict transaction modes do not exist for Durable Object storage; Cloudflare exposes no readonly transaction mode; the driver intentionally exposes no SQL savepoints. Record any newly discovered exclusion with its source test and concrete runtime/API reason before omitting it.

Implement Prompt 8 test-first in this order, running each new/changed spec after its step:

1. Replace the custom `it` wrappers and repeated per-test helper with standard `aroundEach` lifecycle scopes; preserve all existing assertions and prove the current Cloudflare suites still pass.
2. Merge the 60-case compatibility body into the main Durable Object e2e file, retain the 9 Durable Object-specific cases there, delete the redundant compatibility file, and run the merged suite.
3. Copy the 3 missing filter cases from sqlite3/PostgreSQL into the main suite and run it.
4. Add the 3 auto-migration and 6 versioning/cache integration cases in colocated Durable Object files and run each file.
5. Add the 5 migration integration cases, including active-session rollback, and run the file.
6. Add the 14 rename integration cases, including active-session rollback and recreated-client resolution, and run the file.
7. Add the 3 missing supplied/transaction-derived connection cases and run the connection spec.
8. Add the 7 missing Dumbo public transaction cases, preserving the documented workerd pending-transaction behavior where it differs from sqlite3, and the conflicting-source pool case against real workerd; then run the affected Dumbo specs.
9. Add the follow-up direct-client, DDL row-count, nested/lifecycle transaction, driver-selection, Pongo source-conflict/option-precedence, and binding-boundary cases listed above. Run each affected real-workerd spec after its production change.
10. Run the complete Cloudflare project and all repository gates below. Perform the mandatory anti-hack/source review before marking Prompt 8 complete.

Run targeted Pongo tests and Pongo TypeScript build.

Run from src:
- npm run fix
- npm run lint
- npm run types:cloudflare:check
- npm run build:ts
- targeted Pongo Durable Object SQLite unit tests
- targeted Pongo Durable Object SQLite integration/e2e tests
- targeted Dumbo Durable Object SQLite unit/integration tests changed in this prompt
- npm run test:unit
- npm run test:int before completing the phase
- npm run test:e2e
- package builds for Dumbo and Pongo
```

Prompt 8 completion record (2026-09-07): the full Cloudflare project passed 310 tests across 17 files; the unit suite passed 1,261 tests across 87 files; the integration suite passed 593 tests across 52 files; and the e2e suite passed 618 tests with 5 existing skips across 11 files. `npm run fix`, lint, generated Cloudflare type drift, the unified TypeScript build, and Dumbo/Pongo package builds also passed. Final review confirmed exact applicable main/optimistic/supporting-suite parity, real workerd storage throughout Cloudflare integration/e2e tests, and no fake/mock/proxy storage, custom test API, compiler suppression, transaction-control SQL, `transactionSync`, monkey patch, or driver-specific Pongo transaction path. Invalid source combinations are covered by complete Vitest type matrices; runtime zero/multiple-source guards are exercised through the public generic driver registries, including real workerd storage and a real pool for Pongo's multiple-source case.

### Prompt 9: Final Verification And Cleanup [Reopened 2026-09-08]

```text
Finish integration cleanup.

First complete the agreed test-layout cleanup without changing production behavior:
- Rename the 17 Durable Object runtime specs to conventional repository names without a `.cloudflare.` segment.
- Dumbo targets: `connections/connection.int.spec.ts`, `connections/connection.generic.int.spec.ts`, root `driver.int.spec.ts`, `execute/batchCommand.int.spec.ts`, `execute/changesCount.int.spec.ts`, `execute/cloudflareDurableObjectSQLiteClient.int.spec.ts`, `execute/errorMapper.int.spec.ts`, `formatter/sqlFormatter.int.spec.ts`, `pool/cloudflareDurableObjectSQLitePool.int.spec.ts`, and `transactions/transactions.int.spec.ts`.
- Pongo targets: `storage/sqlite/durableObject/autoMigration.int.spec.ts`, `migrations.int.spec.ts`, `rename.int.spec.ts`, `versioningCache.int.spec.ts`, plus `e2e/sqlite/durableObject/durableObject.e2e.spec.ts`, `durableObject.connections.int.spec.ts`, and `durableObject.optimistic-concurrency.e2e.spec.ts`.
- Route Cloudflare Vitest, TypeScript, and ESLint ownership by the Dumbo/Pongo `durableObject` directory paths plus normal `*.int.spec.ts`/`*.e2e.spec.ts` suffixes. Do not route by `.cloudflare.*` filename decoration. Keep production, unit, and type-test files in their normal projects.
- Keep every Dumbo and Pongo runtime suite in an `aroundEach` scope so each test body runs inside `runInDurableObject()` against fresh real `state.storage`; do not retain per-test `withStorage`/`withPool` wrappers.
- Add real-workerd behavioral coverage for a parameterized SQL `null` binding and verify it is stored/read as SQLite `NULL`. Do not use fake storage or implementation-detail assertions.
- Mirror D1/sqlite3 error-preservation coverage with a real workerd constraint failure, proving the mapped `DumboError` retains the runtime error as both `innerError` and `cause`.
- Simplify `cloudflareDurableObjectSQLiteTransaction.ts` without changing its public contract: centralize async `storage.transaction()` depth handling, represent lifecycle state as `idle | active | completed`, keep internal close callbacks out of transaction options, construct executors without mutation, and preserve original errors when cleanup fails. Keep direct callback transactions and the deferred explicit-lifecycle bridge as separate behaviors because Cloudflare exposes only a callback transaction primitive.

Check:
- No orphaned durableObject files are unexported unintentionally.
- src/packages/dumbo/src/cloudflare.ts exports D1 and Durable Object SQLite.
- src/packages/pongo/src/cloudflare.ts exports D1 and Durable Object SQLite.
- src/packages/pongo/src/index.ts can lazy-load 'SQLite:cloudflareDurableObjectSQLite'.
- package exports do not need changes because both packages already expose ./cloudflare.
- Driver names are stable and documented in tests.
- todo.md reflects completed and blocked items accurately.

Run:
- npm run fix
- npm run lint
- npm run types:cloudflare:check
- npm run build
- npm test
- npm run test:bundles

`npm test` is the standard aggregate unit/integration/e2e gate. Its integration and e2e filters select the path-routed Cloudflare project tests by their normal terminal suffixes, so do not run the complete Cloudflare project separately as part of this final gate.

Fix regressions. Summarize behavior, limitations, and exact test commands/results in the final response.
```

Prompt 9 interim record (2026-09-07): the export/orphan audit confirmed that Dumbo and Pongo both expose D1 and Cloudflare Durable Object SQLite through their existing `./cloudflare` package entries, Pongo lazy-loads `SQLite:cloudflareDurableObjectSQLite`, and no Durable Object implementation or test file is orphaned. Bundle boundaries now permit `durableObject` sources only in the Cloudflare artifacts and consumer fixtures verify both ESM and CJS Durable Object driver declarations. Cross-driver review found no production inconsistency with applicable sqlite3, D1, or PostgreSQL behavior. It added missing type coverage for direct connection source exclusivity, plus real-workerd coverage proving direct `batchCommand` rejects asynchronously and rolls back an earlier write when a later SQL statement fails; no production change was required. The low-level connection constructor continues to rely on its exact-one-source TypeScript union, consistently with D1/sqlite3, while pool/driver boundaries provide runtime validation for untyped callers. This remains useful history but does not close the reopened cleanup.

Prompt 9 historical verification record: the listed targeted checks passed on 2026-09-07, and Prompt 8 retains its earlier full-suite baseline. Those results predate the filename/routing cleanup and parameterized-`null` test, so they do not satisfy the reopened final gate. The user will run the required commands after implementation; keep Prompt 9 open and record results only after the user reports them. No post-cleanup lint, formatting, typecheck, build, Cloudflare, unit, integration, or e2e gate is currently claimed as passed.

Prompt 9 transaction-refactor record (2026-09-08, reviewed 2026-09-09): the final simplification uses flat module factories rather than classes or a nested transaction-shell factory. Callback transactions and opted-in nested callbacks continue to use native async `storage.transaction()` scopes. Explicit `begin()`/`commit()`/`rollback()` continues to use one pending callback bridged by promise resolvers because Cloudflare does not expose an asynchronous imperative transaction object. Storage-depth coordination, deferred idle/active/completed lifecycle state, and public Dumbo transaction wiring are separate module responsibilities. A reviewed follow-up exports shared transaction-result normalization and nested-transaction error construction from the existing core transaction module. All core connection constructors now require one consistent `ConnectionTransactionFactory`; the previous dual initializer/factory option and conditional adapter have been removed. Existing PostgreSQL, sqlite3, and D1 transaction implementations are composed through their unchanged generic DB-client factory. The Durable Object ambient connection supplies its configured factory directly, so callback transactions delegate to native `storage.transaction()`, explicit transactions use the deferred lifecycle bridge, and neither path requires post-construction method replacement or a fabricated close callback. The remaining transaction-depth state, deferred lifecycle bridge, rollback sentinel, and exact rollback-reason identity check are intentional runtime-contract machinery. `npm run fix`, `npm run lint`, and the unified `npm run build:ts` passed after this follow-up; runtime tests remain part of the open user-run Prompt 9 gate.

Prompt 9 ownership-test record (2026-09-09): the direct and generic connection suites for Durable Object SQLite, D1, sqlite3, and PostgreSQL now verify the same caller-ownership contract behaviorally: after the wrapper connection and pool close, a real caller-supplied client can still execute a query. The generic suites also prove a supplied connection remains usable, matching existing direct-driver coverage, and PostgreSQL additionally proves a supplied native pool remains usable. This closes the previous gap where tests immediately closed supplied resources and therefore could not detect accidental ownership transfer. The PostgreSQL generic suite now consistently constructs every tested wrapper through `dumbo`/`pgDumboDriver` rather than accidentally testing `pgPool` directly. The tests use real backend clients/storage and contain no mocks, spies, compiler suppressions, or implementation-detail assertions.

## Known Risks And Decisions To Revisit

- Durable Object SQLite storage is obtained only inside the test Durable Object through `runInDurableObject()`; there is no D1-style `getD1Database()` handle for this adapter.
- Durable Object `SqlStorage.exec()` is synchronous, but Dumbo's execution API is async. The adapter should stay async at Dumbo boundaries while consuming cursors synchronously internally.
- Transaction semantics are not SQL-statement based. Any implementation that emits `BEGIN` or `SAVEPOINT` through `exec()` is wrong for this driver.
- `rowsWritten` is Cloudflare billing/write-count oriented and includes index writes. Dumbo command row counts use synchronous `total_changes()` before/after execution to detect whether rows changed, then `changes()` for the logical top-level count. Indexed DML and DML-followed-by-DDL tests protect both sides of this behavior.
- Raw `SqlStorage` is intentionally unsupported because every constructed driver must provide the unified async transaction API through full `DurableObjectStorage`.
- Pongo optimistic concurrency may rely on precise affected-row counts. Include specific tests before considering full support complete.
- The generic `transactionFactoryWithDbClient` resets its cached transaction through a callback invoked by driver commit/rollback. Its outer `begin()` runs before `executeInTransaction` enters its `try` block, so a failed begin never reaches commit, rollback, or the reset callback and leaves the failed transaction cached. PostgreSQL, sqlite3, and D1 all use this factory. Fix this through an explicit, typed transaction lifecycle-completion contract with failed-root-begin coverage; do not wrap or replace transaction methods after construction, and do not issue an unconditional rollback when the backend reports that begin itself failed.
