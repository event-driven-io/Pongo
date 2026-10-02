import { dumbo, SQL, type Dumbo } from '@event-driven-io/dumbo';
import {
  PostgreSQLConnectionString,
  tableExists,
} from '@event-driven-io/dumbo/pg';
import {
  sharedPostgreSQLDatabase,
  type SharedPostgreSQLDatabase,
} from '@event-driven-io/testing/postgresql';
import assert from 'assert';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'vitest';
import { pongoDriver } from '..';
import { pongoClient, pongoSchema, type PongoClient } from '../../../../core';

type User = { _id?: string; name: string };

describe('Client level autoMigration', () => {
  let pool: Dumbo;
  let database: SharedPostgreSQLDatabase;
  let connectionString: PostgreSQLConnectionString;
  let client: PongoClient;

  beforeAll(async () => {
    database = await sharedPostgreSQLDatabase();
    connectionString = PostgreSQLConnectionString(database.connectionString);
    pool = dumbo({ connectionString });
  }, 120000);

  afterAll(async () => {
    await pool.close();
    await database.close();
  });

  beforeEach(async () => {
    await pool.execute.query(
      SQL`DROP SCHEMA IF EXISTS crm CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;`,
    );
  });

  afterEach(async () => {
    await client?.close();
  });

  it('does not create the collection when set to None', async () => {
    client = pongoClient({
      driver: pongoDriver,
      connectionString,
      schema: { autoMigration: 'None' },
    });

    await assert.rejects(() =>
      client.db().collection<User>('users').insertOne({ name: 'Oskar' }),
    );

    assert.strictEqual(await tableExists(pool.execute, 'users'), false);
  });

  it('creates the collection when set to CreateOrUpdate', async () => {
    client = pongoClient({
      driver: pongoDriver,
      connectionString,
      schema: { autoMigration: 'CreateOrUpdate' },
    });

    await client.db().collection<User>('users').insertOne({ name: 'Oskar' });

    assert.strictEqual(await tableExists(pool.execute, 'users'), true);
  });

  it('creates the collection declared in a named schema when set to CreateOrUpdate', async () => {
    const definition = pongoSchema.client({
      database: pongoSchema.db({
        schemas: {
          crm: pongoSchema.schema('crm', {
            users: pongoSchema.collection<User>('users'),
          }),
        },
      }),
    });

    client = pongoClient({
      driver: pongoDriver,
      connectionString,
      schema: { autoMigration: 'CreateOrUpdate', definition },
    });

    await client
      .db('database')
      .collection<User>('users', { databaseSchemaName: 'crm' })
      .insertOne({ name: 'Oskar' });

    const crmUsersExists = await pool.execute.query<{ exists: boolean }>(
      SQL`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'crm' AND table_name = 'users'
        )`,
    );

    assert.strictEqual(crmUsersExists.rows[0]?.exists, true);
  });
});
