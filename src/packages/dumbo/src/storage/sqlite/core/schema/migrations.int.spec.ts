import assert from 'assert';
import fs from 'fs';
import { afterEach, beforeEach, describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { InMemorySQLiteDatabase, SQLiteConnectionString } from '..';
import { count, dumbo, sql, SQL, type Dumbo } from '../../../..';
import { type SQLMigration } from '../../../../core/schema';
import { tableExists } from '../../../../sqlite3';
import { runSQLiteMigrations } from './migrations';

void describe('Migration Integration Tests', () => {
  const inMemoryfileName = InMemorySQLiteDatabase;

  const testDatabasePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  const fileName = path.resolve(testDatabasePath, 'test.db');
  const connectionString = SQLiteConnectionString(`file:${fileName}`);

  const testCases = [
    {
      testName: 'in-memory',
      connectionString: inMemoryfileName,
    },
    { testName: 'file', connectionString },
  ];

  for (const { testName, connectionString } of testCases) {
    let pool: Dumbo;

    void describe(`dumbo with ${testName} database`, () => {
      beforeEach(() => {
        pool = dumbo({ connectionString, connector: 'SQLite:sqlite3' });
      });

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

      void it('should apply multiple migrations sequentially', async () => {
        const firstMigration: SQLMigration = {
          name: 'initial_setup',
          sqls: [
            SQL`
              CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
              );
            `,
          ],
        };

        const secondMigration: SQLMigration = {
          name: 'add_roles_table',
          sqls: [
            SQL`
              CREATE TABLE roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role_name TEXT NOT NULL UNIQUE,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
              );
            `,
          ],
        };
        await runSQLiteMigrations(pool, [firstMigration, secondMigration], {
          lock: { options: { timeoutMs: 300 } },
        });

        const usersTableExists = await tableExists(pool, 'users');
        const rolesTableExists = await tableExists(pool, 'roles');

        assert.ok(usersTableExists, 'The users table should exist.');
        assert.ok(rolesTableExists, 'The roles table should exist.');
      });

      // void it('should timeout if the advisory lock is not acquired within the specified time', async () => {
      //   const migration: SQLMigration = {
      //     name: 'timeout_migration',
      //     sqls: [
      //       SQL`CREATE TABLE timeout_table (
      //           id SERIAL PRIMARY KEY,
      //           data TEXT NOT NULL
      //       );`,
      //     ],
      //   };

      //   //Simulate holding the advisory lock
      //   const connection = await pool.connection();
      //   try {
      //     await acquireAdvisoryLock(connection.execute, {
      //       lockId: MIGRATIONS_LOCK_ID,
      //       mode: 'Permanent',
      //     });

      //     try {
      //       await runSQLiteMigrations(pool, [migration], {
      //         lock: { options: { timeoutMs: 300 } },
      //       });

      //       assert.fail('The migration should have timed out and not proceeded.');
      //     } catch (error) {
      //       assert.ok(error instanceof Error);
      //       assert.strictEqual(
      //         error.message,
      //         'Failed to acquire advisory lock within the specified timeout. Migration aborted.',
      //         'Should throw a timeout error.',
      //       );
      //     }
      //   } finally {
      //     await releaseAdvisoryLock(connection.execute, {
      //       lockId: MIGRATIONS_LOCK_ID,
      //     });
      //     await connection.close();
      //   }
      // });

      // void it('should ensure that advisory locks prevent failing on concurrent migrations', async () => {
      //   const migration: SQLMigration = {
      //     name: 'concurrent_migration',
      //     sqls: [
      //       SQL`
      //               CREATE TABLE concurrent_table (
      //                   id SERIAL PRIMARY KEY,
      //                   data TEXT NOT NULL
      //               );`,
      //     ],
      //   };

      //   // Run the first migration but simulate long execution by not releasing the lock immediately
      //   const connection = await pool.connection();
      //   try {
      //     // Simulate other migration holding the advisory lock
      //     await acquireAdvisoryLock(connection.execute, {
      //       lockId: MIGRATIONS_LOCK_ID,
      //     });
      //     await Promise.all([
      //       runSQLiteMigrations(pool, [migration]),
      //       // simulate other projection running in parallel
      //       new Promise((resolve) => setTimeout(resolve, 100)).then(() =>
      //         releaseAdvisoryLock(connection.execute, {
      //           lockId: MIGRATIONS_LOCK_ID,
      //         }),
      //       ),
      //     ]); // This should wait due to the lock
      //   } finally {
      //     await connection.close();
      //   }
      //   const wasCreated = await tableExists(pool, 'concurrent_table');

      //   assert.ok(wasCreated, 'The concurrent_table should exist.');
      // });

      void it('should correctly apply a migration if the hash matches the previous migration with the same name', async () => {
        const migration: SQLMigration = {
          name: 'hash_check_migration',
          sqls: [
            SQL`
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
          ],
        };

        await runSQLiteMigrations(pool, [migration]);

        // Attempt to run the same migration again with the same content
        await runSQLiteMigrations(pool, [migration]); // This should succeed without error

        const migrationCount = await count(
          pool.execute.query<{ count: number }>(
            sql(
              'SELECT COUNT(*) as count FROM migrations WHERE name = %L',
              'hash_check_migration',
            ),
          ),
        );
        assert.strictEqual(
          migrationCount,
          1,
          'The migration should only be applied once.',
        );
      });

      void it('should fail if a migration with the same name has a different hash', async () => {
        const migration: SQLMigration = {
          name: 'hash_check_migration',
          sqls: [
            SQL`
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
          ],
        };

        await runSQLiteMigrations(pool, [migration]);

        const modifiedMigration: SQLMigration = {
          ...migration,
          sqls: [
            SQL`
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL,
                    extra_column INT
                );`,
          ],
        };

        try {
          await runSQLiteMigrations(pool, [modifiedMigration]);
          assert.fail(
            'The migration should have failed due to a hash mismatch.',
          );
        } catch (error) {
          assert.ok(error instanceof Error);
          assert.strictEqual(
            error.message,
            `Migration hash mismatch for "hash_check_migration". Aborting migration.`,
            'Should throw a hash mismatch error.',
          );
        }
      });

      void it('should handle a large migration with multiple SQL statements', async () => {
        const migration: SQLMigration = {
          name: 'large_migration',
          sqls: [
            SQL`
                CREATE TABLE large_table_1 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
            SQL`
                CREATE TABLE large_table_2 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
            SQL`
                CREATE TABLE large_table_3 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
            SQL`
                CREATE TABLE large_table_4 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
          ],
        };

        await runSQLiteMigrations(pool, [migration]);

        const table1Exists = await tableExists(pool, 'large_table_1');
        const table2Exists = await tableExists(pool, 'large_table_2');
        const table3Exists = await tableExists(pool, 'large_table_3');
        const table4Exists = await tableExists(pool, 'large_table_4');

        assert.ok(table1Exists, 'The large_table_1 table should exist.');
        assert.ok(table2Exists, 'The large_table_2 table should exist.');
        assert.ok(table3Exists, 'The large_table_3 table should exist.');
        assert.ok(table4Exists, 'The large_table_4 table should exist.');
      });
    });
  }
});
