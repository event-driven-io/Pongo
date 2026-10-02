# Dumbo

Dumbo provides relational database connections, SQL queries, and schema migrations for PostgreSQL and SQLite, including sqlite3, Cloudflare D1, and Durable Object storage.

## Schema components and database migrators

`SchemaComponent` and `AnySchemaComponent` describe storage-agnostic migration graphs. They do not own a pool, connection, transaction, or driver. Compose their migrations before binding the graph to a database with `databaseMigrator()`:

```ts
import { databaseMigrator } from '@event-driven-io/dumbo';

const migrator = databaseMigrator({
  component,
  pool,
  autoMigration: 'None',
});

const sql = migrator.sql();
await migrator.migrate();
await migrator.ensureMigrated();
```

`component` is an `AnySchemaComponent` and `pool` is the target Dumbo pool. The factory accepts existing migration-table, executor, transaction, timeout, hash-ignore, lock, and migration defaults. `ensureMigrated()` always runs on the configured executor or, without one, in its own transaction, so it never joins a caller's transaction. Only `migrate()` accepts a per-call `execute`, for example to run inside an active transaction. The component graph and history table are fixed for the migrator's lifetime; create a new migrator when they change.

`DatabaseMigrator` exposes `component`, `sql()`, `print()`, `migrate()`, and `ensureMigrated()`. SQL rendering includes only component migrations, excluding migration-history and lock bookkeeping. Composition preserves migration order, deduplicates equivalent SQL with the same name, and rejects conflicting SQL for a shared name.

The default `CreateOrUpdate` policy applies pending migrations lazily during `ensureMigrated()`. Under `None`, assurance reads migration history without creating the history table, acquiring a migration lock, or executing DDL. Missing migrations or hash mismatches produce a `PendingMigrationsError` containing the pending `SQLMigration` values in `pendingMigrations`. The existing `ignoreMigrationHashMismatch` option controls hash comparison. Missing history tables count as empty history, and unrelated historical rows are ignored. Assurance checks recorded migrations rather than inspecting database objects.

Explicit `migrate()` runs under either policy and is never memoized. Successful `ensureMigrated()` is memoized, so later calls skip the check; failed calls can retry. Concurrent first calls may each run the check; the PostgreSQL advisory lock and SQLite's single writer serialize their migrations, so each migration is applied once. Options passed to one `migrate()` call, such as `migrationTable`, apply to that call only. `migrate({ dryRun: true })` executes within a transaction and rolls back. A dry run, including `ensureMigrated({ dryRun: true })`, never satisfies assurance. Use `sql()` or `print()` to preview SQL without executing it.

See the [Pongo schema migration guide](../../docs/schema-migrations.md) for database-wide provisioning and declarative collection components.
