import assert from 'assert';
import fs from 'fs';
import { afterEach, describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { InMemorySQLiteDatabase, sqlitePool } from '..';
import { rawSql } from '../../../../core';

void describe('SQLite Transactions', () => {
  const inMemoryfileName: string = InMemorySQLiteDatabase;

  const testDatabasePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  const fileName = path.resolve(testDatabasePath, 'test-transactions.db');

  const testCases = [
    { testName: 'in-memory', fileName: inMemoryfileName },
    // { testName: 'file', fileName: fileName },
  ];

  afterEach(() => {
    if (!fs.existsSync(fileName)) {
      return;
    }
    try {
      fs.unlinkSync(fileName);
    } catch (error) {
      console.log('Error deleting file:', error);
    }
  });

  for (const { testName, fileName } of testCases) {
    void describe(`transactions with ${testName} database`, () => {
      void it('commits a nested transaction with pool', async () => {
        const pool = sqlitePool({ connector: 'SQLite:sqlite3', fileName });
        const connection = await pool.connection();

        try {
          await connection.execute.query(
            rawSql('CREATE TABLE test_table (id INTEGER, value TEXT)'),
          );

          const result = await connection.withTransaction<{
            id: null | string;
          }>(async () => {
            await connection.execute.query(
              rawSql(
                'INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id',
              ),
            );

            const result = await connection.withTransaction<{
              id: null | string;
            }>(async () => {
              const result = await connection.execute.query(
                rawSql(
                  'INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id',
                ),
              );
              return { success: true, result: result.rows[0]?.id ?? null };
            });

            return { success: true, result: result };
          });

          assert.strictEqual(result, 1);

          const rows = await connection.execute.query(
            rawSql('SELECT COUNT(*) as count  FROM test_table'),
          );

          assert.strictEqual(rows.rows[0].count, 2);
        } finally {
          await connection.close();
          await pool.close();
        }
      });
      void it('commits a nested transaction with singleton pool', async () => {
        const pool = sqlitePool({
          connector: 'SQLite:sqlite3',
          fileName,
          singleton: true,
        });
        const connection = await pool.connection();
        const connection2 = await pool.connection();

        try {
          await connection.execute.query(
            rawSql('CREATE TABLE test_table (id INTEGER, value TEXT)'),
          );

          const result = await connection.withTransaction<{
            id: null | string;
          }>(async () => {
            await connection.execute.query(
              rawSql(
                'INSERT INTO test_table (id, value) VALUES (2, "test") RETURNING id',
              ),
            );

            const result = await connection2.withTransaction<{
              id: null | string;
            }>(async () => {
              const result = await connection2.execute.query(
                rawSql(
                  'INSERT INTO test_table (id, value) VALUES (1, "test") RETURNING id',
                ),
              );
              return { success: true, result: result.rows[0]?.id ?? null };
            });

            return { success: true, result: result };
          });

          assert.strictEqual(result, 1);

          const rows = await connection.execute.query(
            rawSql('SELECT COUNT(*) as count  FROM test_table'),
          );

          assert.strictEqual(rows.rows[0].count, 2);
        } finally {
          await connection.close();
          await pool.close();
        }
      });
    });
  }
});
