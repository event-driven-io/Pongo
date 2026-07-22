import { SQL } from '@event-driven-io/dumbo';
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

const isNestedTransactionsDisabledError = (error: unknown): boolean =>
  error instanceof Error &&
  'errorType' in error &&
  error.errorType === 'InvalidOperationError' &&
  error.message.includes('allowNestedTransactions');

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

  it('runs nested Pongo transaction on existing Dumbo connection without nested transaction options', async () => {
    const pool = sqlite3Pool({ fileName });

    try {
      await pool.withConnection(async (connection) => {
        const options = {
          driver: databaseDriver,
          connectionString,
          connectionOptions: { connection },
        } as unknown as PongoClientOptions<typeof databaseDriver>;

        const pongo = pongoClient(options);
        const db = pongo.db();

        await db.withTransaction((outer) =>
          outer.withTransaction((inner) => inner.execute.query(SQL`SELECT 1`)),
        );
      });
    } finally {
      await pool.close();
    }
  });

  it('respects explicitly disabled nested transactions on existing Dumbo connection', async () => {
    const pool = sqlite3Pool({ fileName });

    try {
      await pool.withConnection(async (connection) => {
        const options = {
          driver: databaseDriver,
          connectionString,
          connectionOptions: {
            connection,
            transactionOptions: { allowNestedTransactions: false },
          },
        } as unknown as PongoClientOptions<typeof databaseDriver>;

        const pongo = pongoClient(options);
        const db = pongo.db();

        await assert.rejects(
          () =>
            db.withTransaction((outer) =>
              outer.withTransaction((inner) =>
                inner.execute.query(SQL`SELECT 1`),
              ),
            ),
          isNestedTransactionsDisabledError,
        );
      });
    } finally {
      await pool.close();
    }
  });

  it('threads savepoint option on existing Dumbo connection', async () => {
    const pool = sqlite3Pool({ fileName });

    try {
      await pool.withConnection(async (connection) => {
        const tableName = `savepoints_${randomUUID().replaceAll('-', '')}`;
        await connection.execute.command(
          SQL`CREATE TABLE ${SQL.identifier(tableName)} (id INTEGER NOT NULL)`,
        );

        const options = {
          driver: databaseDriver,
          connectionString,
          connectionOptions: {
            connection,
            transactionOptions: { useSavepoints: true },
          },
        } as unknown as PongoClientOptions<typeof databaseDriver>;

        const pongo = pongoClient(options);
        const db = pongo.db();

        await db.withTransaction(async (outer) => {
          await outer.execute.command(
            SQL`INSERT INTO ${SQL.identifier(tableName)} (id) VALUES (1)`,
          );

          await outer.withTransaction(async (inner) => {
            await inner.execute.command(
              SQL`INSERT INTO ${SQL.identifier(tableName)} (id) VALUES (2)`,
            );

            return { success: false, result: undefined };
          });
        });

        const result = await connection.execute.query<{ count: number }>(
          SQL`SELECT COUNT(*) as count FROM ${SQL.identifier(tableName)}`,
        );

        assert.strictEqual(Number(result.rows[0]?.count), 1);
      });
    } finally {
      await pool.close();
    }
  });
});
