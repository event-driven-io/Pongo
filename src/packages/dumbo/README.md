# Dumbo

Dumbo provides relational database connections, SQL queries, and schema migrations for PostgreSQL and SQLite, including sqlite3, Cloudflare D1, and Durable Object storage.

## Schema migrations

Describe your schema as a schema component, bind it to a pool with `schemaComponentMigrator()`, and migrate:

```ts
import {
  schemaComponent,
  schemaComponentMigrator,
  SQL,
  sqlMigration,
} from '@event-driven-io/dumbo';

const users = schemaComponent('users', {
  migrations: () => [
    sqlMigration('users:create', [SQL`CREATE TABLE users (id INTEGER)`]),
  ],
});

const migrator = schemaComponentMigrator({ pool, component: users });

await migrator.migrate();
```

`migrate()` applies the migrations that the database hasn't recorded yet, in one transaction, and records them in the `dmb_migrations` table. Each migration runs once. Later calls find it recorded and skip it. After a successful call, the migrator remembers the result and skips the database.

`ensureMigrated()` only reads the same history. When migrations are missing, it throws `PendingMigrationsError`, and its `pendingMigrations` property lists them:

```ts
await migrator.ensureMigrated();
```

Use it in applications whose database user can't create tables, after a deployment step called `migrate()`. If your library has an automatic-migration setting, pick the call from it:

```ts
await (autoMigration === 'None'
  ? migrator.ensureMigrated()
  : migrator.migrate());
```

### Composing components

A component can contain other components. Its migrations come first, then its children's, in the order you list them:

```ts
const app = schemaComponent('app', {
  components: [users, orders],
});
```

When two components contain a migration with the same name and the same SQL, Dumbo runs it once. With the same name and different SQL, `migrations()` throws `InvalidOperationError` before anything runs.

A migrator is bound to one component and one history table. When either changes, create a new migrator.

### Options

`schemaComponentMigrator()` takes `pool` and `component`, and these optional settings:

- `migrationTable`: the history table as `{ schemaName, tableName }`. The default is `dmb_migrations`.
- `execute`: the executor to read the history and apply migrations on. By default, Dumbo uses the pool and opens a transaction for the migrations.
- `transactionOptions`: options for that transaction.
- `lock`: the database lock taken while migrations run. On PostgreSQL, the default is an advisory lock.
- `dryRun`, `ignoreMigrationHashMismatch`, `migrationTimeoutMS`: described below.

`migrate()` also accepts `execute`, `dryRun`, `ignoreMigrationHashMismatch`, and `migrationTimeoutMS` per call. Pass `execute` to run the migrations in your own transaction, so they commit or roll back with it. Because your transaction can still roll back, the next call checks the database again.

### Previews and dry runs

`sql()` returns the SQL of the component's migrations, and `print()` writes it to the console. Both work without a database connection.

`migrate({ dryRun: true })` runs the migrations in a transaction and rolls it back. After a dry run, the next call checks the database again.

### Hash mismatches

Dumbo records a hash of each migration's SQL. If the SQL of a recorded migration changes, `migrate()` and `ensureMigrated()` throw `InvalidOperationError` before they write anything.

To accept the change, set `ignoreMigrationHashMismatch: true` on the migrator or the call, or `ignoreHashMismatch: true` on one migration:

```ts
sqlMigration('users:create', [SQL`CREATE TABLE users (id TEXT)`], {
  ignoreHashMismatch: true,
});
```

Dumbo then treats the migration as applied: the database keeps what the original SQL created, and the history keeps the original hash.

### Concurrent migrations

When two calls migrate the same database at the same time, both may find the same migration missing. One applies it. The other fails with `UniqueConstraintError`, and its transaction rolls back. When you retry the failed call, it finds the migration recorded and succeeds.

### Checking database objects

Tests often need to check that a migration created what it should. Dumbo provides these checks:

- `@event-driven-io/dumbo/postgresql`: `schemaExists`, `tableExists`, `columnExists`, `functionExists`, `indexExists`, and `sequenceExists`.
- `@event-driven-io/dumbo/sqlite`: `tableExists`, `columnExists`, and `indexExists`.

Pass `{ databaseSchemaName }` to look in a specific database schema:

```ts
await columnExists(pool.execute, 'users', 'email', {
  databaseSchemaName: 'crm',
});
```

Without it, PostgreSQL looks in every schema on the `search_path`, and SQLite looks for the plain table name.

In PostgreSQL migrations, `createFunctionIfDoesNotExistSQL()` creates a function only when the database schema doesn't have it yet:

```ts
sqlMigration('answer:create', [
  createFunctionIfDoesNotExistSQL(
    'answer',
    SQL`CREATE FUNCTION crm.answer() RETURNS INTEGER AS $answer$ SELECT 42 $answer$ LANGUAGE SQL;`,
    { databaseSchemaName: 'crm' },
  ),
]);
```

Dumbo runs the definition inside a `DO $$` block, so end it with `;` and quote its body with a named tag such as `$answer$`. Without `databaseSchemaName`, Dumbo checks the current schema, where an unqualified `CREATE FUNCTION` creates the function.

See the [Pongo schema migration guide](../../docs/schema-migrations.md) for how Pongo uses these migrations.
