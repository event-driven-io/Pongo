# Dumbo

Dumbo provides relational database connections, SQL queries, and schema migrations for PostgreSQL and SQLite, including sqlite3, Cloudflare D1, and Durable Object storage.

## Schema components and schema component migrators

`SchemaComponent` and `AnySchemaComponent` describe storage-agnostic migration graphs. They do not own a pool, connection, transaction, or driver. Compose their migrations before binding the graph to a database with `schemaComponentMigrator()`:

```ts
import { schemaComponentMigrator } from '@event-driven-io/dumbo';

const migrator = schemaComponentMigrator({
  component,
  pool,
  autoMigration: 'None',
});

const sql = migrator.sql();
await migrator.ensureMigrated();
await migrator.migrate({ migrationStyle: 'CreateOrUpdate' });
```

`component` is an `AnySchemaComponent` and `pool` is the target Dumbo pool. The factory accepts existing migration-table, executor, transaction, timeout, hash-ignore, lock, and migration defaults. `ensureMigrated()` only reads the migration history on the configured executor or the pool. Only `migrate()` accepts a per-call `execute`, for example to run inside an active transaction. The component graph and history table are fixed for the migrator's lifetime; create a new migrator when they change.

`SchemaComponentMigrator` exposes `component`, `sql()`, `print()`, `migrate()`, and `ensureMigrated()`. SQL rendering includes only component migrations, excluding migration-history and lock bookkeeping. Composition preserves migration order, deduplicates equivalent SQL with the same name, and rejects conflicting SQL for a shared name.

`migrate()` first reads the migration history without a transaction, DDL, or migration lock, and returns when nothing is pending. Otherwise, under the default `CreateOrUpdate` style it applies the pending migrations, and under `None` it throws a `PendingMigrationsError` containing the pending `SQLMigration` values in `pendingMigrations`. The style comes from `autoMigration`, and a call can override it with `migrationStyle`. `ensureMigrated()` runs only the check and throws the same error, whatever the style. The existing `ignoreMigrationHashMismatch` option controls hash comparison. Missing history tables count as empty history, and unrelated historical rows are ignored. The check compares recorded migrations rather than inspecting database objects.

Once `migrate()` or `ensureMigrated()` finds nothing pending, or `migrate()` applies the pending migrations, the migrator remembers it and later calls skip the database. Calls in a dry run or on a per-call `execute` aren't remembered, because their changes can roll back. Failed calls can retry. Concurrent first calls may each run the check; the PostgreSQL advisory lock and SQLite's single writer serialize their migrations, so each migration is applied once. `migrate({ dryRun: true })` executes within a transaction and rolls back. Use `sql()` or `print()` to preview SQL without executing it.

See the [Pongo schema migration guide](../../docs/schema-migrations.md) for database-wide provisioning and declarative collection components.
