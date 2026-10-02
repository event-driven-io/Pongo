# Schema migrations

Pongo migrates a database as one ordered plan containing its database schema and all registered collections. Register the collections before provisioning, then call `db.schema.migrate()` once:

```ts
import { pongoClient } from '@event-driven-io/pongo';
import { pongoDriver } from '@event-driven-io/pongo/pg';

const client = pongoClient({
  driver: pongoDriver,
  connectionString: 'postgresql://localhost/pongo',
  schema: { autoMigration: 'None' },
});
const db = client.db();
const users = db.collection<{ name: string }>('users');
const orders = db.collection<{ total: number }>('orders');

await db.schema.migrate();
await users.insertOne({ name: 'Anita' });
await orders.insertOne({ total: 42 });
```

`PongoDb.schema` is the operational migration boundary. It exposes `component`, `sql()`, `print()`, `migrate()`, and `ensureMigrated()`, plus Pongo's `migrations` and `renameCollection()` members. `sql()` returns SQL for the database's component graph; `print()` writes that SQL to the console. Both exclude migration-history table creation, locks, and migration-record bookkeeping and perform no migration assurance.

`collection.schema.component` is a declarative Dumbo schema component. It describes collection migrations for composition with a storage owner; it does not own a connection or expose migration operations. A component can be reused with different databases without sharing migration state.

## Automatic assurance

Pongo defaults to `schema: { autoMigration: 'CreateOrUpdate' }`. Collection operations and raw SQL through `db.sql.query()` and `db.sql.command()` lazily call the database's `ensureMigrated()`, which applies pending migrations. You can also call it explicitly:

```ts
await db.schema.ensureMigrated();
```

With `autoMigration: 'None'`, assurance reads the existing migration history without executing DDL, creating the history table, or acquiring a migration lock. Missing migrations and hash mismatches cause a Dumbo `PendingMigrationsError`, whose `pendingMigrations` property contains the pending `SQLMigration` values. A missing history table counts as empty history. Extra historical migrations are ignored, and `ignoreMigrationHashMismatch` controls whether differing hashes count as pending. This check compares migration records; it does not inspect the actual tables or indexes.

An explicit `db.schema.migrate()` runs regardless of `autoMigration`, including under `None`. This lets provisioning code apply the schema while runtime code uses read-only assurance. A `migrationTable` passed to one call, as in `db.schema.migrate({ migrationTable: { schemaName: 'ops' } })`, applies to that call only; later assurance keeps reading the migration table configured for the database.

Assurance runs in its own migration transaction, outside any session transaction. On D1, which cannot open these transactions, it runs directly on the pool. If the first operation on a collection runs inside a session transaction that later aborts, the collection's table stays in place, while the documents written in that transaction roll back. An explicit `db.schema.migrate({ session })` behaves differently: it runs inside the session's active transaction and rolls back with it.

Successful assurance is memoized for the current database graph, so later operations skip the check. Explicit `db.schema.migrate()` is never memoized. Concurrent first operations may each run the check; the PostgreSQL advisory lock and SQLite's single writer serialize them, so each migration is applied once. Failed calls can retry. Registering another collection replaces the database's migrator; the next operation assures the expanded graph, applying or reporting new migrations according to the configured policy.

Renaming a collection under `autoMigration: 'None'` registers the rename migration without applying it. The table keeps its old name until an explicit `db.schema.migrate()`, and until then operations on the renamed collection throw `PendingMigrationsError`. Under `CreateOrUpdate`, the rename is applied immediately.

## Dry runs

```ts
await db.schema.migrate({ dryRun: true });
```

A dry run executes migration SQL inside a transaction and rolls it back on PostgreSQL, sqlite3, and Durable Object storage. It requires the privileges needed to execute that SQL and does not satisfy later migration assurance. Cloudflare D1 does not support these migration transactions, so Pongo rejects `schema.migrate({ dryRun: true })` on D1. To preview SQL without executing it on any backend, use `db.schema.sql()` or `db.schema.print()`. To check recorded migration state without DDL, configure `autoMigration: 'None'` and call `ensureMigrated()`.

## Dumbo database migrators

Dumbo separates the storage-agnostic `AnySchemaComponent` graph from the database-bound `DatabaseMigrator`. Bind a component to an existing Dumbo pool with `databaseMigrator()`:

```ts
import { databaseMigrator } from '@event-driven-io/dumbo';

const migrator = databaseMigrator({
  component: db.schema.component,
  pool,
  autoMigration: 'None',
  ignoreMigrationHashMismatch: false,
});

const sql = migrator.sql();
await migrator.ensureMigrated();
await migrator.migrate();
```

Here `pool` is the concrete Dumbo pool for the database to migrate. The factory also accepts the existing migration-table configuration, executor, timeout, lock, and migration defaults. `ensureMigrated()` always runs on the configured executor or, without one, in its own transaction; only `migrate()` accepts a per-call `execute`. Its component graph and history-table configuration remain fixed for its lifetime. Create a new migrator when either changes. Pongo performs this replacement for you when its collection graph changes.

Dumbo flattens component migrations in composition order. Equivalent SQL with the same migration name is included once; conflicting SQL for the same name is rejected before migration execution. The composed plan uses one runner and its database transaction.

## Beta migration note

Replace `collection.schema.migrate()` with `db.schema.migrate()`. Register every required collection before migrating so the database plan includes them all. Collection schema objects now expose only `component`; use that value when contributing a collection schema to another storage owner's graph.
