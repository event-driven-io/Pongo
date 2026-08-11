import assert from 'assert';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { InMemorySQLiteDatabase } from '..';
import { dumbo, type Dumbo } from '../../../..';
import {
  databaseComponent,
  databaseSchemaKey,
  databaseSchemaComponent,
  dumboSchema,
  indexComponent,
  runSQLMigrations,
  SQL,
  SQLDefaultSchemaNameToken,
  tableComponent,
} from '../../../../core';
import {
  indexExists,
  SQLite3DriverType,
  tableExists,
} from '../../../../sqlite3';

const usersEmail = indexComponent({
  indexName: 'users_email_idx',
  columnNames: ['email'],
  isUnique: true,
});

const users = () =>
  tableComponent({
    tableName: 'users',
    columns: {
      _id: dumboSchema.column('_id', SQL.column.type.Text, {
        primaryKey: true,
        notNull: true,
      }),
      email: dumboSchema.column('email', SQL.column.type.Text, {
        notNull: true,
      }),
    },
    indexes: { email: usersEmail },
  });

const usersIn = (schemaName: string | SQLDefaultSchemaNameToken) =>
  databaseSchemaComponent({ schemaName, tables: { users: users() } });

describe('running SQLite schema component SQL against a database', () => {
  let pool: Dumbo;

  beforeEach(() => {
    pool = dumbo({
      connectionString: InMemorySQLiteDatabase,
      driverType: SQLite3DriverType,
    });
  });

  afterEach(() => pool.close());

  const migrate = (...schemas: ReturnType<typeof usersIn>[]) =>
    runSQLMigrations(
      pool,
      databaseComponent({
        schemas: Object.fromEntries(
          schemas.map((schema) => [
            databaseSchemaKey(schema.schemaName),
            schema,
          ]),
        ),
      }).migrations(),
    );

  it('creates a table for the default schema under its plain name', async () => {
    await migrate(usersIn(SQLDefaultSchemaNameToken.from()));

    assert.ok(await tableExists(pool.execute, 'users'));
    assert.ok(await indexExists(pool.execute, 'users_email_idx'));
  });

  it('folds a named schema into the physical table and index names', async () => {
    await migrate(usersIn('crm'));

    assert.ok(await tableExists(pool.execute, 'crm.users'));
    assert.ok(await indexExists(pool.execute, 'crm.users_email_idx'));
    assert.ok(!(await tableExists(pool.execute, 'users')));
  });

  it('keeps the default schema and a named one on separate tables', async () => {
    await migrate(usersIn(SQLDefaultSchemaNameToken.from()), usersIn('crm'));

    await pool.execute.command(
      SQL`INSERT INTO users (_id, email) VALUES ('1', 'default@test')`,
    );

    const defaultRows = await pool.execute.query<{ count: number }>(
      SQL`SELECT COUNT(*) as count FROM users`,
    );
    const crmRows = await pool.execute.query<{ count: number }>(
      SQL`SELECT COUNT(*) as count FROM ${SQL.identifier('crm.users')}`,
    );

    assert.strictEqual(defaultRows.rows[0]?.count, 1);
    assert.strictEqual(crmRows.rows[0]?.count, 0);
  });
});
