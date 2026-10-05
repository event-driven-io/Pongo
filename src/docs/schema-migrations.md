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

`PongoDb.schema` is the operational migration boundary. It exposes `component`, `sql()`, `print()`, `migrate()`, and `ensureMigrated()`, plus Pongo's `migrations` and `renameCollection()` members. `sql()` returns SQL for the database's component graph; `print()` writes that SQL to the console. Both exclude migration-history table creation, locks, and migration-record bookkeeping and don't check or apply migrations.

`collection.schema.component` is a declarative Dumbo schema component. It describes collection migrations for composition with a storage owner; it does not own a connection. The deprecated `collection.schema.migrate()` calls `db.schema.migrate()` and migrates the whole database, not only the collection. A component can be reused with different databases without sharing migration state.

## Automatic migration

Pongo defaults to `schema: { autoMigration: 'CreateOrUpdate' }`. Before collection operations and raw SQL through `db.sql.query()` and `db.sql.command()`, Pongo uses this setting to choose the migrator call. Under `CreateOrUpdate`, it calls `migrate()`, which applies pending migrations. Under `None`, it calls `ensureMigrated()`, which throws a Dumbo `PendingMigrationsError` when migrations are pending. Its `pendingMigrations` property contains the pending `SQLMigration` values.

Every `migrate()` and `ensureMigrated()` call first reads the migration history without a transaction, DDL, or migration lock, and returns without writing when nothing is pending. Missing migrations and hash mismatches count as pending. A missing history table counts as empty history. Extra historical migrations are ignored, and `ignoreMigrationHashMismatch` controls whether differing hashes count as pending. This check compares migration records; it does not inspect the actual tables or indexes.

`db.schema.ensureMigrated()` runs only that check, whatever the `autoMigration` setting is:

```ts
await db.schema.ensureMigrated();
```

An explicit `db.schema.migrate()` always applies pending migrations, also under `None`. Provisioning code calls it, while runtime clients keep `autoMigration: 'None'`. The migration table comes from the client or database options and stays the same for every call.

Automatic migration runs in its own migration transaction, outside any session transaction. On D1, which cannot open these transactions, it runs directly on the pool. If the first operation on a collection runs inside a session transaction that later aborts, the collection's table stays in place, while the documents written in that transaction roll back.

Explicit schema operations behave differently. `db.schema.migrate({ session })`, `collection.createCollection({ session })`, and `collection.rename(newName, { session })` run inside the session's active transaction and roll back with it. A rename and the document writes in one transaction therefore commit or roll back together.

Once `migrate()` or `ensureMigrated()` finds nothing pending, or `migrate()` applies the pending migrations, the database's migrator remembers it, so later calls skip the database. A dry run and a `migrate()` inside a session's active transaction aren't remembered, because their changes roll back. Concurrent first operations may each run the check; the PostgreSQL advisory lock and SQLite's single writer serialize them, so each migration is applied once. Failed calls can retry. Registering another collection replaces the database's migrator; the next operation checks the expanded graph and applies or reports new migrations according to the configured `autoMigration`.

Renaming a collection under `autoMigration: 'None'` registers the rename migration without applying it, because runtime clients often do not have DDL permissions. The table keeps its old name until `db.schema.migrate()`, and until then operations on the renamed collection throw `PendingMigrationsError`. Under `CreateOrUpdate`, the rename is applied immediately.

## Dry runs

```ts
await db.schema.migrate({ dryRun: true });
```

A dry run executes migration SQL inside a transaction and rolls it back on PostgreSQL, sqlite3, and Durable Object storage. It requires the privileges needed to execute that SQL, and its result isn't remembered. Cloudflare D1 does not support these migration transactions, so Pongo rejects `schema.migrate({ dryRun: true })` on D1. To preview SQL without executing it on any backend, use `db.schema.sql()` or `db.schema.print()`. To check recorded migration state without DDL, call `ensureMigrated()`.

## Dumbo schema component migrators

Dumbo separates the storage-agnostic `AnySchemaComponent` graph from the database-bound `SchemaComponentMigrator`. Bind a component to an existing Dumbo pool with `schemaComponentMigrator()`:

```ts
import { schemaComponentMigrator } from '@event-driven-io/dumbo';

const migrator = schemaComponentMigrator({
  component: db.schema.component,
  pool,
  ignoreMigrationHashMismatch: false,
});

const sql = migrator.sql();
await migrator.ensureMigrated();
await migrator.migrate();
```

Here `pool` is the concrete Dumbo pool for the database to migrate. The factory also accepts the existing migration-table configuration, executor, timeout, lock, and migration defaults. `migrate()` applies pending migrations. `ensureMigrated()` only reads the migration history on the configured executor or the pool; only `migrate()` accepts a per-call `execute`. Its component graph and history-table configuration remain fixed for its lifetime. Create a new migrator when either changes. Pongo performs this replacement for you when its collection graph changes.

The migrator does not read `autoMigration`. Code that migrates automatically chooses the call itself, as Pongo does:

```ts
await (autoMigration === 'None'
  ? migrator.ensureMigrated()
  : migrator.migrate());
```

Dumbo flattens component migrations in composition order. Equivalent SQL with the same migration name is included once; conflicting SQL for the same name is rejected before migration execution. The composed plan uses one runner and its database transaction.

## Beta migration note

Replace the deprecated `collection.schema.migrate()` with `db.schema.migrate()`. Register every required collection before migrating so the database plan includes them all. Use `collection.schema.component` when contributing a collection schema to another storage owner's graph.
