# Schema migrations

Pongo migrates a database as one ordered plan containing its database schema and all registered collections. Register the collections before provisioning, then call `db.schema.migrate()` once with the migration style the call may apply:

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

await db.schema.migrate({ migrationStyle: 'CreateOrUpdate' });
await users.insertOne({ name: 'Anita' });
await orders.insertOne({ total: 42 });
```

`PongoDb.schema` is the operational migration boundary. It exposes `component`, `sql()`, `print()`, `migrate()`, and `ensureMigrated()`, plus Pongo's `migrations` and `renameCollection()` members. `sql()` returns SQL for the database's component graph; `print()` writes that SQL to the console. Both exclude migration-history table creation, locks, and migration-record bookkeeping and don't check or apply migrations.

`collection.schema.component` is a declarative Dumbo schema component. It describes collection migrations for composition with a storage owner; it does not own a connection or expose migration operations. A component can be reused with different databases without sharing migration state.

## Automatic migration

Pongo defaults to `schema: { autoMigration: 'CreateOrUpdate' }`. Before collection operations and raw SQL through `db.sql.query()` and `db.sql.command()`, Pongo calls the database migrator's `migrate()` with that setting. Under `CreateOrUpdate`, it applies pending migrations. Under `None`, it throws a Dumbo `PendingMigrationsError` instead, whose `pendingMigrations` property contains the pending `SQLMigration` values.

Every `migrate()` call first reads the migration history without a transaction, DDL, or migration lock, and returns without writing when nothing is pending. Missing migrations and hash mismatches count as pending. A missing history table counts as empty history. Extra historical migrations are ignored, and `ignoreMigrationHashMismatch` controls whether differing hashes count as pending. This check compares migration records; it does not inspect the actual tables or indexes.

`db.schema.ensureMigrated()` runs only that check, under every `autoMigration` setting, and throws `PendingMigrationsError` when migrations are pending:

```ts
await db.schema.ensureMigrated();
```

An explicit `db.schema.migrate()` follows the configured `autoMigration` unless the call passes `migrationStyle`. Provisioning code passes `migrationStyle: 'CreateOrUpdate'`, so it applies migrations while runtime clients keep `autoMigration: 'None'`. Calling `db.schema.migrate()` without `migrationStyle` is deprecated. The migration table comes from the client or database options and stays the same for every call.

Automatic migration runs in its own migration transaction, outside any session transaction. On D1, which cannot open these transactions, it runs directly on the pool. If the first operation on a collection runs inside a session transaction that later aborts, the collection's table stays in place, while the documents written in that transaction roll back. An explicit `db.schema.migrate({ session, migrationStyle })` behaves differently: it runs inside the session's active transaction and rolls back with it.

Once `migrate()` or `ensureMigrated()` finds nothing pending, or `migrate()` applies the pending migrations, the database's migrator remembers it, so later calls skip the database. A dry run and a `migrate()` inside a session's active transaction aren't remembered, because their changes roll back. Concurrent first operations may each run the check; the PostgreSQL advisory lock and SQLite's single writer serialize them, so each migration is applied once. Failed calls can retry. Registering another collection replaces the database's migrator; the next operation checks the expanded graph and applies or reports new migrations according to the configured `autoMigration`.

Renaming a collection under `autoMigration: 'None'` registers the rename migration without applying it. The table keeps its old name until `db.schema.migrate({ migrationStyle: 'CreateOrUpdate' })`, and until then operations on the renamed collection throw `PendingMigrationsError`. Under `CreateOrUpdate`, the rename is applied immediately.

## Dry runs

```ts
await db.schema.migrate({ dryRun: true, migrationStyle: 'CreateOrUpdate' });
```

A dry run executes migration SQL inside a transaction and rolls it back on PostgreSQL, sqlite3, and Durable Object storage. It requires the privileges needed to execute that SQL, and its result isn't remembered. Cloudflare D1 does not support these migration transactions, so Pongo rejects `schema.migrate({ dryRun: true })` on D1. To preview SQL without executing it on any backend, use `db.schema.sql()` or `db.schema.print()`. To check recorded migration state without DDL, call `ensureMigrated()`.

## Dumbo schema component migrators

Dumbo separates the storage-agnostic `AnySchemaComponent` graph from the database-bound `SchemaComponentMigrator`. Bind a component to an existing Dumbo pool with `schemaComponentMigrator()`:

```ts
import { schemaComponentMigrator } from '@event-driven-io/dumbo';

const migrator = schemaComponentMigrator({
  component: db.schema.component,
  pool,
  autoMigration: 'None',
  ignoreMigrationHashMismatch: false,
});

const sql = migrator.sql();
await migrator.ensureMigrated();
await migrator.migrate({ migrationStyle: 'CreateOrUpdate' });
```

Here `pool` is the concrete Dumbo pool for the database to migrate. The factory also accepts the existing migration-table configuration, executor, timeout, lock, and migration defaults. `migrate()` applies migrations according to `autoMigration`, and a call can override it with `migrationStyle`. `ensureMigrated()` only reads the migration history on the configured executor or the pool; only `migrate()` accepts a per-call `execute`. Its component graph and history-table configuration remain fixed for its lifetime. Create a new migrator when either changes. Pongo performs this replacement for you when its collection graph changes.

Dumbo flattens component migrations in composition order. Equivalent SQL with the same migration name is included once; conflicting SQL for the same name is rejected before migration execution. The composed plan uses one runner and its database transaction.

## Beta migration note

Replace `collection.schema.migrate()` with `db.schema.migrate()`. Register every required collection before migrating so the database plan includes them all. Collection schema objects now expose only `component`; use that value when contributing a collection schema to another storage owner's graph.
