import { dumbo, SQL, type Dumbo } from '@event-driven-io/dumbo';
import {
  PostgreSQLConnectionString,
  tableExists,
} from '@event-driven-io/dumbo/pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
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
import { pongoClient, type PongoClient } from '../../../../core';

type User = { _id?: string; name: string };

describe('Client level autoMigration', () => {
  let pool: Dumbo;
  let postgres: StartedPostgreSqlContainer;
  let connectionString: PostgreSQLConnectionString;
  let client: PongoClient;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = PostgreSQLConnectionString(postgres.getConnectionUri());
    pool = dumbo({ connectionString });
  }, 120000);

  afterAll(async () => {
    await pool.close();
    await postgres.stop();
  });

  beforeEach(async () => {
    await pool.execute.query(
      SQL`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`,
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
});
