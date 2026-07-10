import {
  SQLiteConnectionString,
  sqlite3Pool,
} from '@event-driven-io/dumbo/sqlite3';
import assert from 'assert';
import fs from 'fs';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, describe, it } from 'vitest';
import { pongoClient, type PongoClientOptions } from '../../..';
import { sqlite3Driver as databaseDriver } from '../../../storage/sqlite/sqlite3';

type User = {
  _id?: string;
  name: string;
};

describe('Pongo SQLite3 connections', () => {
  const testDatabasePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  const fileName = path.resolve(testDatabasePath, 'connections.test.db');
  const connectionString = SQLiteConnectionString(`file:${fileName}`);

  afterEach(() => {
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.unlinkSync(`${fileName}${suffix}`);
      } catch {
        // ignore missing files
      }
    }
  });

  it('connects using existing connection passed through connectionOptions', async () => {
    const pool = sqlite3Pool({ fileName });

    try {
      const connection = await pool.connection();

      const options = {
        driver: databaseDriver,
        connectionString,
        connectionOptions: { connection },
      } as unknown as PongoClientOptions<typeof databaseDriver>;

      const pongo = pongoClient(options);

      try {
        const users = pongo.db().collection<User>('connections');
        await users.insertOne({ name: randomUUID() });
        await users.insertOne({ name: randomUUID() });

        const count = await users.countDocuments({});
        assert.strictEqual(Number(count), 2);
      } finally {
        await pongo.close();
      }
    } finally {
      await pool.close();
    }
  });
});
