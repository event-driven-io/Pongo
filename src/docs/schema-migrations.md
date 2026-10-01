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

Pongo defaults to `schema: { autoMigration: 'CreateOrUpdate' }`. Database and collection operations lazily call the database's `ensureMigrated()`, which applies pending migrations. You can also call it explicitly:

```ts
await db.schema.ensureMigrated();
```

With `autoMigration: 'None'`, assurance reads the existing migration history without executing DDL, creating the history table, or acquiring a migration lock. Missing migrations and hash mismatches cause a Dumbo `PendingMigrationsError`, whose `pendingMigrations` property contains the pending `SQLMigration` values. A missing history table counts as empty history. Extra historical migrations are ignored, and `ignoreMigrationHashMismatch` controls whether differing hashes count as pending. This check compares migration records; it does not inspect the actual tables or indexes.

An explicit `db.schema.migrate()` runs regardless of `autoMigration`, including under `None`. This lets provisioning code apply the schema while runtime code uses read-only assurance.

Successful migration or assurance is memoized for the current database graph, and concurrent assurance calls share the same work. Failed calls can retry. Registering another collection replaces the database's migrator; the next operation assures the expanded graph, applying or reporting new migrations according to the configured policy.

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

Here `pool` is the concrete Dumbo pool for the database to migrate. The factory also accepts the existing migration-table configuration, executor, timeout, lock, and migration defaults. Its component graph and history-table configuration remain fixed for its lifetime. Create a new migrator when either changes. Pongo performs this replacement for you when its collection graph changes.

Dumbo flattens component migrations in composition order. Equivalent SQL with the same migration name is included once; conflicting SQL for the same name is rejected before migration execution. The composed plan uses one runner and its database transaction.

## Beta migration note

Replace `collection.schema.migrate()` with `db.schema.migrate()`. Register every required collection before migrating so the database plan includes them all. Collection schema objects now expose only `component`; use that value when contributing a collection schema to another storage owner's graph.
