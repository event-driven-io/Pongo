import assert from 'assert';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { InMemorySQLiteDatabase } from '..';
import { dumbo, type Dumbo } from '../../../..';
import {
  dumboSchema,
  indexComponent,
  SQL,
  SQLDefaultSchemaNameToken,
  tableComponent,
} from '../../../../core';
import {
  indexExists,
  SQLite3DriverType,
  tableExists,
} from '../../../../sqlite3';
import { sqliteIndexSQL, sqliteTableSQL } from './schemaComponentSQL';

const users = tableComponent({
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
});
const usersEmail = indexComponent({
  indexName: 'users_email_idx',
  columnNames: ['email'],
  isUnique: true,
});

describe('running SQLite schema component SQL against a database', () => {
  let pool: Dumbo;

  beforeEach(() => {
    pool = dumbo({
      connectionString: InMemorySQLiteDatabase,
      driverType: SQLite3DriverType,
    });
  });

  afterEach(() => pool.close());

  it('creates a table for the default schema under its plain name', async () => {
    const identifier = {
      databaseSchemaName: SQLDefaultSchemaNameToken.from(),
      tableName: 'users',
      indexName: 'users_email_idx',
    };

    await pool.execute.command(sqliteTableSQL(users, identifier));
    await pool.execute.command(sqliteIndexSQL(usersEmail, identifier));

    assert.ok(await tableExists(pool.execute, 'users'));
    assert.ok(await indexExists(pool.execute, 'users_email_idx'));
  });

  it('folds a named schema into the physical table and index names', async () => {
    const identifier = {
      databaseSchemaName: 'crm',
      tableName: 'users',
      indexName: 'users_email_idx',
    };

    await pool.execute.command(sqliteTableSQL(users, identifier));
    await pool.execute.command(sqliteIndexSQL(usersEmail, identifier));

    assert.ok(await tableExists(pool.execute, 'dumbo_crm_table_users'));
    assert.ok(
      await indexExists(
        pool.execute,
        'dumbo_crm_table_users_index_users__email__idx',
      ),
    );
    assert.ok(!(await tableExists(pool.execute, 'users')));
  });

  it('keeps the default schema and a named one on separate tables', async () => {
    const inDefault = {
      databaseSchemaName: SQLDefaultSchemaNameToken.from(),
      tableName: 'users',
    };
    const inCRM = { databaseSchemaName: 'crm', tableName: 'users' };

    await pool.execute.command(sqliteTableSQL(users, inDefault));
    await pool.execute.command(sqliteTableSQL(users, inCRM));

    await pool.execute.command(
      SQL`INSERT INTO users (_id, email) VALUES ('1', 'default@test')`,
    );

    const defaultRows = await pool.execute.query<{ count: number }>(
      SQL`SELECT COUNT(*) as count FROM users`,
    );
    const crmRows = await pool.execute.query<{ count: number }>(
      SQL`SELECT COUNT(*) as count FROM dumbo_crm_table_users`,
    );

    assert.strictEqual(defaultRows.rows[0]?.count, 1);
    assert.strictEqual(crmRows.rows[0]?.count, 0);
  });
});
