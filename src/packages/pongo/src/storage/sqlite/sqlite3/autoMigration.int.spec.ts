import { SQL } from '@event-driven-io/dumbo';
import {
  SQLiteConnectionString,
  sqlite3Pool,
  tableExists,
  type Sqlite3Pool,
} from '@event-driven-io/dumbo/sqlite3';
import assert from 'assert';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { pongoClient, pongoSchema, type PongoClient } from '../../../core';
import { sqlite3Driver } from '.';

type User = { _id?: string; name: string };

describe('Client level autoMigration', () => {
  let fileName: string;
  let connectionString: SQLiteConnectionString;
  let pool: Sqlite3Pool;
  let client: PongoClient;

  beforeEach(() => {
    fileName = path.resolve(
      '/tmp',
      `pongo-sqlite3-automigration-${randomUUID()}.db`,
    );
    connectionString = SQLiteConnectionString(`file:${fileName}`);
    pool = sqlite3Pool({ fileName });
  });

  afterEach(async () => {
    await client?.close();
    await pool.close();

    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.unlinkSync(`${fileName}${suffix}`);
      } catch {
        // ignore missing files
      }
    }
  });

  it('does not create the collection when set to None', async () => {
    client = pongoClient({
      driver: sqlite3Driver,
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
      driver: sqlite3Driver,
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
      driver: sqlite3Driver,
      connectionString,
      schema: { autoMigration: 'CreateOrUpdate', definition },
    });

    await client
      .db('database')
      .collection<User>('users', { databaseSchemaName: 'crm' })
      .insertOne({ name: 'Oskar' });

    const crmUsersExists = await pool.execute.query<{ name: string }>(
      SQL`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'crm.users'`,
    );

    assert.deepStrictEqual(
      crmUsersExists.rows.map(({ name }) => name),
      ['crm.users'],
    );
  });
});
