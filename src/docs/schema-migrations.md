# Schema migrations

Pongo stores each collection in its own table. By default, Pongo creates that table on the first operation on the collection. You can also create the tables in a deployment step and let the application only use them. This page shows both setups.

## Default: tables are created when needed

```ts
import { pongoClient } from '@event-driven-io/pongo';
import { pongoDriver } from '@event-driven-io/pongo/pg';

const client = pongoClient({
  driver: pongoDriver,
  connectionString: 'postgresql://localhost/pongo',
});
const users = client.db().collection<{ name: string }>('users');

// creates the users table, then inserts the document
await users.insertOne({ name: 'Anita' });
```

Pongo checks the schema once per database. Later operations skip the check. When you add another collection, the next operation checks again and creates the new table.

## Migrate in a deployment step

Register all collections, then call `db.schema.migrate()`. It creates the missing tables in one transaction:

```ts
const client = pongoClient({
  driver: pongoDriver,
  connectionString: 'postgresql://localhost/pongo',
});
const db = client.db();
db.collection<{ name: string }>('users');
db.collection<{ total: number }>('orders');

await db.schema.migrate();
```

Run the application with `autoMigration: 'EnsureMigrated'`:

```ts
const client = pongoClient({
  driver: pongoDriver,
  connectionString: 'postgresql://localhost/pongo',
  schema: { autoMigration: 'EnsureMigrated' },
});
```

With `EnsureMigrated`, the first operation only reads the migration history. The application's database user needs read access to the history table and read and write access to the collection tables. If the deployment step missed a migration, the operation throws `PendingMigrationsError`. Its `pendingMigrations` property lists the missing migrations.

To run the same check yourself, for example at startup or in a health check, call:

```ts
await db.schema.ensureMigrated();
```

`ensureMigrated()` reads the history under any `autoMigration` setting.

With `autoMigration: 'None'`, Pongo neither migrates nor reads the migration history. Operations on a missing table fail with the database error. Use it when your application or library runs the migrations or the checks itself.

## Preview the SQL

`db.schema.sql()` returns the SQL that creates the registered collections, and `db.schema.print()` writes it to the console. Both work without a database connection.

A transactional dry run executes the migrations against the database and rolls them back:

```ts
await db.schema.migrate({ dryRun: 'transactional' });
```

The database user needs permissions to create tables. Cloudflare D1 does not support transactions, so on D1 a transactional dry run throws `InvalidOperationError`.

A diff dry run only reads the migration history. It returns the migrations that `migrate()` would apply, and works on every database, including D1:

```ts
const { applied } = await db.schema.migrate({ dryRun: 'diff' });
```

## Migration history

Pongo records each applied migration and a hash of its SQL in the `dmb_migrations` table. To use another table, pass `migrationTable` to `pongoClient()` or `client.db()`:

```ts
const client = pongoClient({
  driver: pongoDriver,
  connectionString: 'postgresql://localhost/pongo',
  migrationTable: { tableName: 'app_migrations' },
});
```

If the SQL of an applied migration changes, its hash no longer matches the recorded one. Pongo then throws `InvalidOperationError` with the message `Migration hash mismatch for "<name>". Aborting migration.` before it writes anything. To accept the change, call:

```ts
await db.schema.migrate({ ignoreMigrationHashMismatch: true });
```

Pongo then treats that migration as applied, keeps the table as it is, and keeps the recorded hash.

Because the recorded hash stays, the next check without the option throws again. To ignore hash mismatches in every check and migration of a client, including automatic ones, set it on the client:

```ts
const client = pongoClient({
  driver: pongoDriver,
  connectionString: 'postgresql://localhost/pongo',
  schema: { ignoreMigrationHashMismatch: true },
});
```

A `migrate()` call can still override it with its own `ignoreMigrationHashMismatch`.

To record the new hashes instead, so that no option is needed later, call `migrate()` once with `overrideMigrationHashes`:

```ts
await db.schema.migrate({ overrideMigrationHashes: true });
```

Pongo then writes the new hash of each changed migration into the history, without running its SQL again. You can't combine it with `ignoreMigrationHashMismatch: false`.

## Transactions

Automatic migration runs in its own transaction, outside your session. If the first operation on a collection runs in a session transaction that later aborts, the table stays and the documents written in that transaction roll back.

`db.schema.migrate({ session })`, `collection.createCollection({ session })`, and `collection.rename(newName, { session })` run in the session's transaction and roll back with it. For example, a rename and the document writes in one transaction commit or roll back together.

On D1, automatic migration runs directly on the database. D1 writes each migration together with its history record, so a failed migration leaves neither.

## Renaming a collection

Under `CreateOrUpdate`, `collection.rename(newName)` renames the table immediately.

Under `EnsureMigrated` and `None`, `rename()` registers the rename migration, and the table keeps its old name until your deployment step calls `db.schema.migrate()`. Until then, under `EnsureMigrated`, operations on the renamed collection throw `PendingMigrationsError`. Under `None`, they fail with the database error for the missing table.

## Several application instances

When several instances, or concurrent first operations in one instance, try to apply the same migration at the same time, one of them applies it. The others fail with Dumbo's `UniqueConstraintError`, and their migration transactions roll back. When you retry such an operation, Pongo finds the migration recorded and continues.

To avoid these failures, migrate in a deployment step and run the instances with `autoMigration: 'EnsureMigrated'`.

## Composing schemas with Dumbo

`db.schema.component` and `collection.schema.component` are Dumbo schema components. A library such as Emmett can add them to its own schema and migrate everything in one call with Dumbo's `schemaComponentMigrator()`:

```ts
import { schemaComponentMigrator } from '@event-driven-io/dumbo';

const migrator = schemaComponentMigrator({
  pool,
  component: db.schema.component,
});

await migrator.migrate();
```

`pool` is the Dumbo pool for the database. The Dumbo README describes the migrator's options and behavior.
