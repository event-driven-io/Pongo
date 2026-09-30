import { JSONSerializer, SQL } from '@event-driven-io/dumbo';
import { sqliteFormatter } from '@event-driven-io/dumbo/sqlite';
import { SQLiteConnectionString } from '@event-driven-io/dumbo/sqlite3';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoDb,
} from '../../..';
import { sqliteSQLBuilder } from '../core';
import { sqlite3Driver } from './';

type User = { _id?: string; name: string };

describe('executing SQLite collection SQL rendered with SQL.format', () => {
  let fileName: string;
  let client: PongoClient;
  let db: PongoDb;

  const builder = sqliteSQLBuilder(
    pongoSchema.collection('users'),
    JSONSerializer,
  );

  const execute = <Row>(query: string, params: unknown[]) =>
    new Promise<Row[]>((resolve, reject) => {
      const database = new sqlite3.Database(fileName);
      database.all<Row>(query, params, (error, rows) => {
        database.close(() => (error ? reject(error) : resolve(rows)));
      });
    });

  beforeEach(async () => {
    fileName = path.resolve('/tmp', `pongo-sqlite3-sql-${randomUUID()}.db`);
    client = pongoClient({
      driver: sqlite3Driver,
      connectionString: SQLiteConnectionString(`file:${fileName}`),
    });
    await client.connect();
    db = client.db('database');

    await db.collection<User>('users').insertMany([
      { _id: 'oskar', name: 'Oskar' },
      { _id: 'anita', name: 'Anita' },
    ]);
  });

  afterEach(async () => {
    await client?.close();

    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.unlinkSync(`${fileName}${suffix}`);
      } catch {
        // ignore missing files
      }
    }
  });

  it('returns the documents matching the filtered find', async () => {
    const { query, params } = SQL.format(
      builder.find<User>({ name: 'Oskar' }),
      sqliteFormatter,
    );

    const rows = await execute<{ _id: string; data: string }>(query, params);

    assert.deepStrictEqual(
      rows.map(({ _id, data }) => ({
        _id,
        name: JSONSerializer.deserialize<User>(data).name,
      })),
      [{ _id: 'oskar', name: 'Oskar' }],
    );
  });

  it('stores a document the collection can find afterwards', async () => {
    const { query, params } = SQL.format(
      builder.insertOne<User>({ _id: 'marcin', name: 'Marcin' }),
      sqliteFormatter,
    );

    await execute(query, params);

    const found = await db.collection<User>('users').findOne({ _id: 'marcin' });
    assert.strictEqual(found?.name, 'Marcin');
  });
});
