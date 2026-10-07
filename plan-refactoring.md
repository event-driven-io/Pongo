# Refactoring plan: database migrator

## Goal

Simplify the staged `databaseMigrator` change. The migrator is an immutable wrapper around one schema component, bound to a pool. It is recreated where the component is recreated. Schema assurance always runs on the migrator's own executor, never inside a caller's session transaction, and is memoized with one boolean. Pongo calls the migrator and does not manage its lifecycle.

## Target design

### Dumbo `databaseMigrator`

```ts
export type DatabaseMigratorOptions = MigratorOptions & {
  pool: Dumbo;
  component: AnySchemaComponent;
  autoMigration?: MigrationStyle | undefined;
};

export type DatabaseMigrator = Readonly<{
  component: AnySchemaComponent;
  sql(): string;
  print(): void;
  migrate(options?: MigratorOptions): Promise<RunSQLMigrationsResult>;
  ensureMigrated(options?: Omit<MigratorOptions, 'execute'>): Promise<void>;
}>;
```

- The factory only stores its options. Registry lookups, the formatter and `component.migrations()` are resolved when a method runs.
- `migrate(options)` calls `runSQLMigrations(pool, component.migrations(), merged)` once. `merged` is the configured options overridden by the per-call values that are defined. A dry run drops `execute`, so `runSQLMigrations` opens its own transaction and rolls it back. `migrate()` never memoizes.
- `ensureMigrated(options)`:

  ```ts
  let ensured = false;

  const ensureMigrated = async (options?: Omit<MigratorOptions, 'execute'>) => {
    if (ensured) return;
    await (autoMigration === 'None' ? checkHistory(options) : migrate(options));
    if (!dryRunFor(options)) ensured = true;
  };
  ```

  `ensureMigrated` does not accept `execute`; it always runs on the configured executor or, without one, in its own transaction. A dry run (configured or per call) never memoizes, as the existing test "runs assurance again after configured dry runs" requires.

- `checkHistory(options)` checks whether the migration table exists through a new per-database `migrationTableExists(execute, tableReference)` registered with the default migrator options, next to the PostgreSQL `AdvisoryLock`. If the table exists, it reads `name, sql_hash` and compares hashes exactly as the staged code does. Pending migrations throw `PendingMigrationsError`.
- PostgreSQL `migrationTableExists`: `to_regclass(...) IS NOT NULL`, passing the table reference rendered by the PostgreSQL formatter, so the search path still applies to unqualified names. SQLite `migrationTableExists`: the `sqlite_master` query from the staged code, with the same physical-name rule.
- `PendingMigrationsError` stays as is.

### Pongo

- `PongoDatabaseComponent` holds one `let migrator` and takes a `createMigrator: (component) => DatabaseMigrator` option. Adding a collection and renaming a collection call `replaceComponent(next)`, which sets `migrator = createMigrator(next)`. Every read of the component (`findTable`, the `expose` and schema-view proxies, the `migrations` getter, `get component()`) goes through `migrator.component`. It exposes `get migrator()`.
- `pongoDb.ts` passes:

  ```ts
  createMigrator: (component) =>
    databaseMigrator({
      ...options.migrationOptions,
      pool,
      component,
      autoMigration: options.schema?.autoMigration ?? 'CreateOrUpdate',
      migrationTable: options.migrationTable,
    }),
  ```

- `ensureSchema`:

  ```ts
  const ensureSchema = (options?: CollectionOperationOptions) =>
    databaseComponent.migrator.ensureMigrated({
      migrationTimeoutMS: timeoutMSOf(options),
    });
  ```

- `db.schema.migrate(options)` passes `execute` only when `options.session` has an active transaction (`(await enlistIntoTransactionIfActive(db, options))?.execute`) and `migrationTimeoutMS: timeoutMSOf(options)`. A `migrationTable` passed to one call applies to that call only.
- `db.schema.sql()`, `print()` and `ensureMigrated()` delegate to `databaseComponent.migrator`.
- `db.sql.query()` and `db.sql.command()` call `ensureSchema(options)` first, like collection operations.
- In `pongoCollection.ts`, `ensureSchema` is required and used directly. `createCollection` keeps calling `db.schema.migrate({ session })`. `rename` under `autoMigration: 'None'` does not call `ensureSchema`; under `CreateOrUpdate` it does.
- The D1 driver keeps `migrationOptions: { execute: pool.execute }`, because D1 cannot open a transaction in its default mode. PostgreSQL, sqlite3 and Durable Objects run automatic migrations in the migrator's own transaction.

## Test rules

These apply to every test added or changed in this plan.

- Name tests after observable behavior from the user's perspective.
- Assert on observable outcomes: tables and indexes that exist, migration history rows, documents read back, errors thrown with their pending migration names.
- Integration tests run against real databases: Testcontainers PostgreSQL, sqlite3 files, Miniflare D1 and Durable Objects. Behavior shared by Pongo drivers lives in `pongo/src/storage/databaseMigratorTests.ts`; driver specs only wire it up.
- `pongoDb.unit.spec.ts` keeps the existing `recordingExecutor` fake only for what it covered before this change: which executor and options an operation uses. It does not impersonate migration history.
- No tests that restate declared types, check `typeof`, check `Object.isFrozen` or compare promise identity.
- Every behavior in "Target design" has a test that fails without it.
- Test output must be clean.

## Work

Three subagents run in parallel. Only A changes application code, and it is the only one with an internal order: Pongo specs import Dumbo from `dist`, so A runs `npm run build:ts` after the Dumbo change and before running any Pongo test. B and C need only the target design above.

| Subagent | Scope                                    | Order                                           |
| -------- | ---------------------------------------- | ----------------------------------------------- |
| A        | Dumbo and Pongo tests and implementation | Tests first, then Dumbo, `build:ts`, then Pongo |
| B        | E2E specs                                | Independent of A until the final run            |
| C        | Docs                                     | Independent                                     |

Final verification runs after all three finish.

### A: migrator in Dumbo and Pongo

#### Tests first

Dumbo, `dumbo/src/storage/sqlite/core/schema/databaseMigrator.int.spec.ts`:

- Keep:
  - "reports missing migrations without creating schema when automatic migration is disabled"
  - "assures explicitly provisioned schema when automatic migration is disabled"
  - "reports a changed migration hash when automatic migration is disabled"
  - "allows a changed hash when hash checking is disabled for the migrator"
  - "allows a changed hash when hash checking is disabled for the migration"
  - "ignores migration history outside its component"
  - "provisions the schema after a dry run"
  - "remembers successful assurance for its schema graph"
  - "retries assurance after failed SQL is repaired"
  - "rolls back schema changes when migration SQL fails"
  - "keeps a configured dry run when a call omits its override value"
  - "runs assurance again after configured dry runs"
  - "allows a call to override configured dry runs"
  - "keeps configured hash-ignore settings when a call omits its override value"
  - "rolls back a dry run when an executor is supplied"
- Rewrite "shares concurrent assurance while provisioning the schema" as "provisions the schema once for concurrent assurance calls": assert one history row for `example:create` and that the table exists. Drop `first === second`.
- Delete:
  - "shares explicit provisioning with concurrent assurance"
  - "waits for concurrent explicit provisioning with automatic migrations disabled"
  - "honors different hash-checking options on concurrent explicit migrations"

Dumbo, `dumbo/src/storage/postgresql/core/schema/databaseMigrator.int.spec.ts`:

- Keep both tests.
- Add "finds migration history in a configured database schema": migrate with `migrationTable: { schemaName: 'ops' }`, then `ensureMigrated()` under `None` with the same table resolves, and with the default table rejects with `PendingMigrationsError`.

Dumbo, `dumbo/src/core/schema/migrators/databaseMigrator.unit.spec.ts`:

- Keep the test, without the `Object.isFrozen` assertion.
- Add "does not access the database when created": a pool whose driver has no registered migrator defaults can still create a migrator and call `sql()`.
- Delete `dumbo/src/core/schema/migrators/databaseMigrator.type.spec.ts`.

Pongo, `pongo/src/storage/databaseMigratorTests.ts`:

- Keep:
  - "reports pending migrations without creating collections or migration history", without the `'migrate' in users.schema` assertion
  - "explicitly provisions under None and assures a fresh database instance from history"
  - "checks newly registered collections after earlier assurance succeeds"
  - "automatically provisions an expanded database graph with CreateOrUpdate"
  - "rolls back dry runs with an inactive session without satisfying assurance"
  - "checks migration history again after an outer migration transaction rolls back"
- Add:
  - "raw SQL creates registered collections before running" (`CreateOrUpdate`): register `users`, query the `users` table through `db.sql.query`, expect success.
  - "raw SQL reports pending migrations when automatic migration is disabled" (`None`).
  - "a migration table passed to one migration applies only to that call": migrate with a custom `migrationTable`, then under `None` `ensureMigrated()` rejects because the configured table has no history.
  - "keeps the schema created by the first operation of a rolled-back transaction" (`CreateOrUpdate`, `supportsRollback` only): start a session transaction, insert into a new collection, abort, then insert outside the session and read the document back.
  - "registering a collection inside a transaction that has written" (`CreateOrUpdate`, `supportsRollback` only): write in a session transaction, register a new collection and insert into it in the same transaction, with a test deadline. The expected outcome is not decided in advance. If it hangs or deadlocks on any backend, A stops and reports to Oskar; otherwise A records the outcome in its report.

Pongo, `pongo/src/core/database/pongoDb.unit.spec.ts`:

- Restore the two timeout tests to their original names, "the first operation on a new collection passes defaultTimeoutMS of its session to its migration" and "the first operation on a new collection passes timeoutMS to its migration", asserting `timeoutMS` 50.
- Delete:
  - "exposes database-wide migration operations and declarative collection schemas"
  - "shares schema migration for concurrent operations in one session transaction"
  - "retries failed session migration on the same transaction before reading documents"
  - "checks recorded migrations once for normal operations with automatic migration disabled"
  - "checks the expanded graph after registering another collection"
- Revert the additions to `recordingExecutor` and `createTestDb`: `migrated`, `historyCalls`, `failMigrationOnce`, `failTransactionMigrationOnce`, and the `node:crypto` and `isTokenizedSQL` imports.
- Adjust the existing session tests that assert migration commands on the transaction executor: automatic migration now runs on the pool.

Pongo, other specs:

- `pongo/src/core/schema/schema.type.spec.ts`: remove the added `PongoDatabaseSchema` assertions.
- `pongo/src/storage/sqlite/sqlite3/rename.int.spec.ts`: restore the rename-under-`None` test to its pre-change form (rename succeeds, the table stays `users` until `migrate()`, then becomes `archived_users`) and add one assertion between rename and migrate: `users.find({})` rejects with `PendingMigrationsError`. Apply the same change to the PostgreSQL and Durable Object rename specs if they contain the same test.
- `pongo/src/storage/postgresql/pg/migrations/migrations.int.spec.ts`: rename "rolls back a collection schema migrate with the active session" to "rolls back a database migration with the active session".

Run the changed Dumbo specs, the Pongo unit spec and the shared suite through `sqlite3/databaseMigrator.int.spec.ts`. Confirm the new and rewritten tests fail for the expected reason.

#### Implementation

Dumbo:

- In `migrator.ts`, add an optional `migrationTableExists?: (execute: SQLExecutor, table: SQLTableReference) => Promise<boolean>` to `MigratorOptions`, next to `lock`.
- Register it in `storage/postgresql/core/schema/migrations.ts` and `storage/sqlite/core/schema/migrations.ts`, as described in "Target design".
- Rewrite `databaseMigrator.ts` to the target design. Remove:
  - `transactionOptions`
  - both option-merge blocks, replaced by one merge of defined per-call values
  - the `pool.withTransaction` branch
  - `inFlight`, `migrationInFlight` and `assured`
  - the PostgreSQL/SQLite branching and manual quoting
- Keep `Object.freeze` on the returned object, matching Dumbo components.
- Keep `getMigrationHash` and `rendersNothing` exported from `migrator.ts` only if `databaseMigrator.ts` uses them. Do not re-export them from the package index.
- Run `npm run build:ts`.

Pongo:

- `pongoDatabaseComponent.ts`: `createMigrator` option, `let migrator`, `replaceComponent`, all reads through `migrator.component`, `get migrator()`.
- `pongoDb.ts`:
  - Pass `createMigrator`.
  - Use the one-line `ensureSchema`.
  - Rewrite `migrate` to the target design.
  - Delegate `sql`, `print` and `ensureMigrated`.
  - Remove `let migrationTable`, `createMigrator`, `currentMigrator`, `sessionMigrators` and `migratorFor`.
- `pongoCollection.ts`:
  - Export `enlistIntoTransactionIfActive` and `timeoutMSOf`.
  - Make `ensureSchema` required and drop the fallback.
  - Make `rename` skip `ensureSchema` under `None`.
- `d1/index.ts`: no change.

#### Verify

From `src`, run the changed Dumbo and Pongo specs, then the migrator, migrations and rename int specs for every backend:

```shell
npx vitest run packages/dumbo/src/storage/sqlite/core/schema/databaseMigrator.int.spec.ts
npx vitest run packages/dumbo/src/storage/postgresql/core/schema/databaseMigrator.int.spec.ts
npx vitest run packages/dumbo/src/core/schema/migrators/databaseMigrator.unit.spec.ts
npx vitest run packages/pongo/src/core/database/pongoDb.unit.spec.ts
npx vitest run packages/pongo/src/storage/sqlite/sqlite3
npx vitest run packages/pongo/src/storage/postgresql/pg
npm run test:int:cloudflare
npm run build:ts
npm run agent:check
npm run test:unit
```

Fix every failure. Report each command and its result.

### B: e2e

- Add `packages/pongo/src/e2e/postgresql/pg/migrations.e2e.spec.ts` and `packages/pongo/src/e2e/sqlite/sqlite3/migrations.e2e.spec.ts` with the scenario "a provisioning client migrates registered collections; a runtime client with `autoMigration: 'None'` reads and writes documents; a collection registered only at runtime is reported as pending".
- Move the least-privilege test from `pg/migrations/databaseMigrator.int.spec.ts` into the PostgreSQL e2e spec. A's verify run then no longer includes it.
- Run both specs and report the result. The runtime-registration assertion may fail until A finishes; any other failure is B's to fix.

### C: docs

Update `src/docs/schema-migrations.md` and `src/packages/dumbo/README.md`:

- Assurance always runs outside session transactions.
- Concurrent first operations may each find the same migration pending. One applies it; the others fail with `UniqueConstraintError`.
- `db.sql` operations ensure the schema.
- Rename under `None` waits for explicit migration.
- Remove "concurrent assurance calls share the same work".

Then run `npm run docs:build`.

## Final verification

After A, B and C finish, from `src`:

```shell
npm run build:ts
npm run agent:check
npm run test:unit
npm test
npm run test:int:cloudflare
```

`npm test` does not include the Cloudflare suite, hence the separate run. Report every command and its result, plus the outcome of "registering a collection inside a transaction that has written" on each backend.

## Out of scope

- Emmett work from `spec.md`.
- Concurrent assurance sharing one run, and retries. Concurrent first operations each run the check; one applies the migration, the others fail with `UniqueConstraintError`.
- `spec.md` and `qa.md` at the repo root are staged; Oskar handles Git.

## Follow-ups

None of these is approved for implementation yet.

### Derived index names

Rule: when `indexName` is missing, derive it from the table name. The database schema comes from the schema component. An explicit `indexName` works as today.

| Declaration                           | PostgreSQL            | SQLite                |
| ------------------------------------- | --------------------- | --------------------- |
| no `indexName`, default schema        | `users_email_idx`     | `users_email_idx`     |
| no `indexName`, schema `crm`          | `crm.users_email_idx` | `crm.users_email_idx` |
| `indexName: 'by_email'`, schema `crm` | `crm.by_email`        | `crm.by_email`        |

- JSON-path indexes (Pongo) all have the column `data`. Derive their names from `indexTargetNames`, with `.` replaced by `_`.
- Two indexes with the same derived name in one table (for example, unique and non-unique on the same columns): throw an error that asks for an explicit name.
- A derived name longer than the PostgreSQL limit of 63 bytes: throw an error. Do not let PostgreSQL truncate it.
- Decision needed, table rename: a derived name changes with the table. After `users` is renamed to `customers`, `CREATE INDEX IF NOT EXISTS customers_email_idx` creates a second index next to `users_email_idx`. Explicit names do not have this problem.
  - A (recommended): rename derived indexes in the table-rename migration (PostgreSQL `ALTER INDEX ... RENAME`, SQLite drop and create).
  - B: derive the name from `renamedFrom`. This breaks after chained renames.
- Decision needed: the branch for this work.

### Dumbo

- Make `databaseSchemaName` optional in `sqliteTableName` and `sqliteIndexName`.
- Validate `.` in names when components are declared.
- Add an optional `tableName` filter to `indexExists`.
- The test "reserves dotted names in the native SQLite namespace" in `sqlitePhysicalNames.unit.spec.ts` is hard to understand.

### Emmett

- Delete `emmett-postgresql/src/testing/schemaObjects.ts`. Use Dumbo's `tableExists`, `functionExists`, `indexExists` and `sequenceExists` with the `{ databaseSchemaName }` option.
- Switch to `schemaComponentMigrator`: `await (autoMigration === 'None' ? migrator.ensureMigrated() : migrator.migrate())`.

### Verification

- `npm test` does not run the bundle project. After a change that adds an import reachable from the root `dumbo` entry, run a `tsdown` build and `npm run test:bundles`.
