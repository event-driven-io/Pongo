import { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import {
  pgFormatter,
  PostgreSQLConnectionString,
} from '@event-driven-io/dumbo/pg';
import {
  sharedPostgreSQLDatabase,
  type SharedPostgreSQLDatabase,
} from '@event-driven-io/testing/postgresql';
import assert from 'node:assert/strict';
import pg from 'pg';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoDb,
} from '../../../core';
import { postgresSQLBuilder } from '../core';
import { pgDriver } from './';

type User = { _id?: string; name: string };

describe('executing PostgreSQL collection SQL rendered with SQL.format', () => {
  let database: SharedPostgreSQLDatabase;
  let connectionString: PostgreSQLConnectionString;
  let pool: pg.Pool;
  let client: PongoClient;
  let db: PongoDb;

  const builder = postgresSQLBuilder(
    pongoSchema.collection('users'),
    JSONSerializer,
  );

  beforeAll(async () => {
    database = await sharedPostgreSQLDatabase();
    connectionString = PostgreSQLConnectionString(database.connectionString);
    pool = new pg.Pool({ connectionString });
    client = pongoClient({ driver: pgDriver, connectionString });
    await client.connect();
    db = client.db();

    await db.collection<User>('users').insertMany([
      { _id: 'oskar', name: 'Oskar' },
      { _id: 'anita', name: 'Anita' },
    ]);
  });

  afterAll(async () => {
    await client?.close();
    await pool?.end();
    await database?.close();
  });

  it('returns the documents matching the filtered find', async () => {
    const { query, params } = SQL.format(
      builder.find<User>({ name: 'Oskar' }),
      pgFormatter,
    );

    const result = await pool.query<{ _id: string; data: User }>(query, params);

    assert.deepStrictEqual(
      result.rows.map(({ _id, data }) => ({ _id, name: data.name })),
      [{ _id: 'oskar', name: 'Oskar' }],
    );
  });

  it('stores a document the collection can find afterwards', async () => {
    const { query, params } = SQL.format(
      builder.insertOne<User>({ _id: 'marcin', name: 'Marcin' }),
      pgFormatter,
    );

    await pool.query(query, params);

    const found = await db.collection<User>('users').findOne({ _id: 'marcin' });
    assert.strictEqual(found?.name, 'Marcin');
  });
});
