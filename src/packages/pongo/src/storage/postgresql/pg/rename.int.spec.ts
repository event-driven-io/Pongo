import { dumbo, SQL, type Dumbo } from '@event-driven-io/dumbo';
import { PostgreSQLConnectionString } from '@event-driven-io/dumbo/pg';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import assert from 'node:assert/strict';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { pongoClient, pongoSchema, type PongoClient } from '../../../core';
import { pgDriver } from './';

type User = { _id?: string; name: string };

describe('renaming a PostgreSQL Pongo collection', () => {
  let pool: Dumbo | undefined;
  let postgres: StartedPostgreSqlContainer | undefined;
  let connectionString: PostgreSQLConnectionString;
  let client: PongoClient;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = PostgreSQLConnectionString(postgres.getConnectionUri());
    pool = dumbo({ connectionString });
  });

  afterAll(async () => {
    await client?.close();
    await pool?.close();
    await postgres?.stop();
  });

  beforeEach(async () => {
    await client?.close();
    await pool?.execute.query(
      SQL`DROP SCHEMA IF EXISTS crm CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;`,
    );
    client = pongoClient({
      driver: pgDriver,
      connectionString,
      defaultSchemaName: 'public',
    });
  });

  it('renames a collection declared in a named schema and keeps the renamed handle usable', async () => {
    const db = client.db('database');
    const users = db.collection<User>('users', { databaseSchemaName: 'crm' });
    await users.insertOne({ name: 'Oskar' });

    const renamed = await users.rename('archived_users');
    await renamed.insertOne({ name: 'Anita' });

    const documents = await renamed.find({});
    assert.deepStrictEqual(documents.map(({ name }) => name).sort(), [
      'Anita',
      'Oskar',
    ]);

    const tables = await pool!.execute.query<{ table_name: string }>(
      SQL`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'crm'
        ORDER BY table_name`,
    );
    assert.deepStrictEqual(
      tables.rows.map((row) => row.table_name),
      ['archived_users'],
    );
  });

  it('resolves data after restart when the declaration uses the renamed table', async () => {
    const originalSchema = pongoSchema.client({
      database: pongoSchema.db({
        schemas: {
          crm: pongoSchema.schema('crm', {
            users: pongoSchema.collection<User>('users'),
          }),
        },
      }),
    });
    await client.close();
    client = pongoClient({
      driver: pgDriver,
      connectionString,
      defaultSchemaName: 'public',
      schema: { definition: originalSchema },
    });
    const db = client.db('database');
    await db.schema.migrate();
    const users = db.collection<User>('users', { databaseSchemaName: 'crm' });
    await users.insertOne({ name: 'Oskar' });
    await users.rename('archived_users');

    const updatedSchema = pongoSchema.client({
      database: pongoSchema.db({
        schemas: {
          crm: pongoSchema.schema('crm', {
            archivedUsers: pongoSchema.collection<User>('archived_users'),
          }),
        },
      }),
    });
    await client.close();
    client = pongoClient({
      driver: pgDriver,
      connectionString,
      defaultSchemaName: 'public',
      schema: { definition: updatedSchema },
    });

    const restarted = client.db('database');
    await restarted.schema.migrate();
    const archived = restarted.collection<User>('archived_users', {
      databaseSchemaName: 'crm',
    });
    const documents = await archived.find({});

    assert.deepStrictEqual(
      documents.map(({ name }) => name),
      ['Oskar'],
    );
  });
});
