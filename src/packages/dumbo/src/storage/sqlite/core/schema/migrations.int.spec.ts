import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { InMemorySQLiteDatabase, SQLiteConnectionString } from '..';
import {
  count,
  DefaultDatabaseSchemaName,
  dumbo,
  single,
  SQL,
  SQLCreateSchema,
  type Dumbo,
} from '../../../..';
import {
  databaseComponent,
  databaseSchemaComponent,
  extensionComponent,
  indexComponent,
  runSQLMigrations,
  sqlMigration,
  tableComponent,
  type SQLMigration,
} from '../../../../core/schema';
import {
  indexExists,
  SQLite3DriverType,
  tableExists,
} from '../../../../sqlite3';

describe('Migration Integration Tests', () => {
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

    describe(`dumbo with ${testName} database`, () => {
      beforeEach(() => {
        pool = dumbo({ connectionString, driverType: SQLite3DriverType });
      });

      afterEach(() => {
        if (!fs.existsSync(fileName)) {
          return;
        }
        try {
          fs.unlinkSync(fileName);
          fs.unlinkSync(`${fileName}-shm`);
          fs.unlinkSync(`${fileName}-wal`);
        } catch (error) {
          console.log('Error deleting file:', error);
        }
      });

      it('should apply multiple migrations sequentially', async () => {
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
        await runSQLMigrations(pool, [firstMigration, secondMigration], {
          lock: { options: { timeoutMs: 300 } },
        });

        const usersTableExists = await tableExists(pool.execute, 'users');
        const rolesTableExists = await tableExists(pool.execute, 'roles');

        assert.ok(usersTableExists, 'The users table should exist.');
        assert.ok(rolesTableExists, 'The roles table should exist.');
      });

      it('uses a custom migration table for all ledger operations', async () => {
        const migration = sqlMigration('custom-ledger:001', [
          SQL`CREATE TABLE custom_ledger_result (id TEXT PRIMARY KEY);`,
        ]);
        const options = {
          migrationTable: { tableName: 'app_migrations' },
        };

        const first = await runSQLMigrations(pool, [migration], options);
        const second = await runSQLMigrations(pool, [migration], options);
        const recorded = await count(
          pool.execute.query(
            SQL`SELECT COUNT(*) AS count FROM app_migrations WHERE name = ${migration.name}`,
          ),
        );

        assert.deepStrictEqual(first.applied, [migration]);
        assert.deepStrictEqual(second.skipped, [migration]);
        assert.strictEqual(recorded, 1);
        assert.strictEqual(
          await tableExists(pool.execute, 'dmb_migrations'),
          false,
        );
      });

      it('folds a schema-qualified migration table into its name', async () => {
        const migration = sqlMigration('audit:001', [
          SQL`CREATE TABLE IF NOT EXISTS folded (id INTEGER PRIMARY KEY)`,
        ]);

        await runSQLMigrations(pool, [migration], {
          migrationTable: { schemaName: 'audit', tableName: 'app_migrations' },
        });

        assert.strictEqual(
          await tableExists(pool.execute, 'audit.app_migrations'),
          true,
        );
        assert.strictEqual(
          await tableExists(pool.execute, 'app_migrations'),
          false,
        );
      });

      it('rolls back migration SQL and ledger writes during dry run', async () => {
        const migration = sqlMigration('dry-run:001', [
          SQL`CREATE TABLE dry_run_result (id TEXT PRIMARY KEY);`,
        ]);

        const result = await runSQLMigrations(pool, [migration], {
          dryRun: true,
        });

        assert.deepStrictEqual(result.applied, [migration]);
        assert.deepStrictEqual(result.skipped, []);
        assert.strictEqual(
          await tableExists(pool.execute, 'dry_run_result'),
          false,
        );
        assert.strictEqual(
          await tableExists(pool.execute, 'dmb_migrations'),
          false,
        );
      });

      it('hashes only the statements it actually runs', async () => {
        const withDeadToken = sqlMigration('hash-filter:001', [
          SQL`${SQLCreateSchema.from({ databaseSchemaName: 'crm' })}`,
          SQL`CREATE TABLE hash_filter (id TEXT PRIMARY KEY);`,
        ]);

        await runSQLMigrations(pool, [withDeadToken]);

        const withoutDeadToken = sqlMigration('hash-filter:001', [
          SQL`CREATE TABLE hash_filter (id TEXT PRIMARY KEY);`,
        ]);

        await runSQLMigrations(pool, [withoutDeadToken]);
      });

      it('accepts a migration name of exactly 255 characters', async () => {
        const migration = sqlMigration('n'.repeat(255), [
          SQL`CREATE TABLE longest_allowed_name (id TEXT PRIMARY KEY);`,
        ]);

        const result = await runSQLMigrations(pool, [migration]);
        const recorded = await count(
          pool.execute.query(
            SQL`SELECT COUNT(*) AS count FROM dmb_migrations WHERE name = ${migration.name}`,
          ),
        );

        assert.deepStrictEqual(result.applied, [migration]);
        assert.strictEqual(recorded, 1);
        assert.strictEqual(
          await tableExists(pool.execute, 'longest_allowed_name'),
          true,
        );
      });

      it('rejects a migration name longer than 255 characters and leaves the ledger unchanged', async () => {
        const alreadyApplied = sqlMigration('already-applied:001', [
          SQL`CREATE TABLE already_applied_result (id TEXT PRIMARY KEY);`,
        ]);
        await runSQLMigrations(pool, [alreadyApplied]);

        const tooLongName = 'n'.repeat(256);
        const shortEnough = sqlMigration('short-enough:002', [
          SQL`CREATE TABLE short_enough_result (id TEXT PRIMARY KEY);`,
        ]);
        const tooLong = sqlMigration(tooLongName, [
          SQL`CREATE TABLE too_long_result (id TEXT PRIMARY KEY);`,
        ]);

        await assert.rejects(
          runSQLMigrations(pool, [shortEnough, tooLong]),
          new Error(
            `Migration name "${tooLongName}" is 256 characters long, exceeding the maximum of 255 characters.`,
          ),
        );

        const migrationNames = await pool.execute.query<{ name: string }>(
          SQL`SELECT name FROM dmb_migrations WHERE name <> 'table:dmb_migrations:create' ORDER BY id`,
        );

        assert.deepStrictEqual(
          migrationNames.rows.map((row) => row.name),
          ['already-applied:001'],
        );
        assert.strictEqual(
          await tableExists(pool.execute, 'short_enough_result'),
          false,
        );
        assert.strictEqual(
          await tableExists(pool.execute, 'too_long_result'),
          false,
        );
      });

      it('runs only the statements of a migration that render non-empty SQL', async () => {
        const migration = sqlMigration('mixed-statements:001', [
          SQL`CREATE TABLE mixed_first (id TEXT PRIMARY KEY);`,
          SQL.EMPTY,
          SQL`CREATE TABLE mixed_second (id TEXT PRIMARY KEY);`,
        ]);

        const result = await runSQLMigrations(pool, [migration]);

        assert.deepStrictEqual(result.applied, [migration]);
        assert.strictEqual(
          await tableExists(pool.execute, 'mixed_first'),
          true,
        );
        assert.strictEqual(
          await tableExists(pool.execute, 'mixed_second'),
          true,
        );
      });

      it('does not record a migration whose statements all render empty SQL', async () => {
        const migration = sqlMigration('all-empty:001', [SQL.EMPTY, SQL.EMPTY]);

        const result = await runSQLMigrations(pool, [migration]);
        const recorded = await count(
          pool.execute.query(
            SQL`SELECT COUNT(*) AS count FROM dmb_migrations WHERE name = ${migration.name}`,
          ),
        );

        assert.deepStrictEqual(result.applied, []);
        assert.deepStrictEqual(result.skipped, [migration]);
        assert.strictEqual(recorded, 0);
      });

      it('runs expanded database and schema feature component migrations in order', async () => {
        const schemaTableMigration = sqlMigration('schema-table:001', [
          SQL`CREATE TABLE component_users (id TEXT PRIMARY KEY);`,
        ]);
        const schemaFeatureMigration = sqlMigration('schema-feature:001', [
          SQL`CREATE TABLE schema_audit_log (id TEXT PRIMARY KEY);`,
        ]);
        const databaseFeatureMigration = sqlMigration('database-feature:001', [
          SQL`CREATE TABLE database_outbox (id TEXT PRIMARY KEY);`,
        ]);
        const audit = extensionComponent('audit', {
          migrations: () => [schemaFeatureMigration],
        });
        const eventStore = extensionComponent('eventStore', {
          migrations: () => [databaseFeatureMigration],
        });
        const users = tableComponent({
          tableName: 'users',
          migrations: () => [schemaTableMigration],
        });
        const component = databaseComponent({
          databaseName: 'app',
          schemas: {
            crm: databaseSchemaComponent({
              schemaName: 'crm',
              tables: { users },
              extensions: { audit },
            }),
          },
          extensions: { eventStore },
        });
        const options = { lock: { options: { timeoutMs: 300 } } };

        await runSQLMigrations(pool, component.migrations(), options);
        await runSQLMigrations(pool, component.migrations(), options);

        const migrationNames = await pool.execute.query<{ name: string }>(
          SQL`SELECT name FROM dmb_migrations WHERE name <> 'table:dmb_migrations:create' ORDER BY id`,
        );

        assert.deepStrictEqual(
          migrationNames.rows.map((row) => row.name),
          ['schema-table:001', 'schema-feature:001', 'database-feature:001'],
        );
        assert.ok(await tableExists(pool.execute, 'component_users'));
        assert.ok(await tableExists(pool.execute, 'schema_audit_log'));
        assert.ok(await tableExists(pool.execute, 'database_outbox'));
      });

      it('runs migrations from indexes declared on tables', async () => {
        const users = tableComponent({
          tableName: 'users',
          migrations: () => [
            sqlMigration('app:users:001:create-table', [
              SQL`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL);`,
            ]),
          ],
          indexes: {
            users_email_idx: indexComponent({
              indexName: 'users_email_idx',
              columnNames: ['email'],
              isUnique: true,
              migrations: () => [
                sqlMigration('app:users:users_email_idx:002:create-index', [
                  SQL`CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users (email);`,
                ]),
              ],
            }),
          },
        });
        const component = databaseComponent({
          databaseName: 'app',
          schemas: {
            main: databaseSchemaComponent({
              schemaName: DefaultDatabaseSchemaName,
              tables: { users },
            }),
          },
        });
        await runSQLMigrations(pool, component.migrations(), {
          lock: { options: { timeoutMs: 300 } },
        });

        const migrationNames = await pool.execute.query<{ name: string }>(
          SQL`SELECT name FROM dmb_migrations WHERE name <> 'table:dmb_migrations:create' ORDER BY id`,
        );

        assert.strictEqual(
          await indexExists(pool.execute, 'users_email_idx'),
          true,
        );
        assert.deepStrictEqual(
          migrationNames.rows.map((row) => row.name),
          [
            'app:users:001:create-table',
            'app:users:users_email_idx:002:create-index',
          ],
        );
      });

      // it('should timeout if the advisory lock is not acquired within the specified time', async () => {
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
      //       await runSQLMigrations(pool, [migration], {
      //         lock: { options: { timeoutMs: 300 } },
      //       });

      //       assert.fail('The migration should have timed out and not proceeded.');
      //     } catch (error) {
      //       assert.ok(error instanceof Error);
      //       assert.strictEqual(
      //         error.message,
      //         'Failed to acquire advisory lock within the specified timeout. Migration aborted.',
      //         'throws a timeout error.',
      //       );
      //     }
      //   } finally {
      //     await releaseAdvisoryLock(connection.execute, {
      //       lockId: MIGRATIONS_LOCK_ID,
      //     });
      //     await connection.close();
      //   }
      // });

      // it('should ensure that advisory locks prevent failing on concurrent migrations', async () => {
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
      //       runSQLMigrations(pool, [migration]),
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

      it('should correctly apply a migration if the hash matches the previous migration with the same name', async () => {
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

        await runSQLMigrations(pool, [migration]);

        // Attempt to run the same migration again with the same content
        await runSQLMigrations(pool, [migration]); // This should succeed without error

        const migrationCount = await count(
          pool.execute.query<{ count: number }>(
            SQL`SELECT COUNT(*) as count FROM dmb_migrations WHERE name = ${migration.name}`,
          ),
        );
        assert.strictEqual(
          migrationCount,
          1,
          'The migration should only be applied once.',
        );
      });

      it('should fail if a migration with the same name has a different hash', async () => {
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

        await runSQLMigrations(pool, [migration]);

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
          await runSQLMigrations(pool, [modifiedMigration]);
          assert.fail(
            'The migration should have failed due to a hash mismatch.',
          );
        } catch (error) {
          assert.ok(error instanceof Error);
          assert.strictEqual(
            error.message,
            `Migration hash mismatch for "hash_check_migration". Aborting migration.`,
            'throws a hash mismatch error.',
          );
        }
      });

      it('should silently be not applied but update hash if a migration with the same name has a different hash with ignoreMigrationHashMismatch setting', async () => {
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

        await runSQLMigrations(pool, [migration]);

        const { sql_hash: initialHash } = await single(
          pool.execute.query<{ sql_hash: string }>(
            SQL`
                SELECT sql_hash FROM dmb_migrations WHERE name = 'hash_check_migration'`,
          ),
        );

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

        const result = await runSQLMigrations(pool, [modifiedMigration], {
          ignoreMigrationHashMismatch: true,
        });

        assert.ok(
          result.skipped.some((m) => m.name === 'hash_check_migration'),
          'The modified migration should be skipped due to hash mismatch.',
        );

        const { sql_hash: updatedHash } = await single(
          pool.execute.query<{ sql_hash: string }>(
            SQL`SELECT sql_hash FROM dmb_migrations WHERE name = 'hash_check_migration'`,
          ),
        );
        assert.notStrictEqual(
          initialHash,
          updatedHash,
          'The migration hash should be updated in the database.',
        );
      });

      it('skips an already applied migration with ignored hash mismatch when its SQL changes', async () => {
        const migration = sqlMigration(
          'ignored_hash_check_migration',
          [
            SQL`
              CREATE TABLE ignored_hash_table (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data TEXT NOT NULL
              );`,
          ],
          { ignoreHashMismatch: true },
        );

        await runSQLMigrations(pool, [migration]);

        const { sql_hash: initialHash } = await single(
          pool.execute.query<{ sql_hash: string }>(
            SQL`SELECT sql_hash FROM dmb_migrations WHERE name = 'ignored_hash_check_migration'`,
          ),
        );

        const modifiedMigration = sqlMigration(
          migration.name,
          [
            SQL`
              CREATE TABLE ignored_hash_table (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data TEXT NOT NULL,
                extra_column INTEGER
              );`,
          ],
          { ignoreHashMismatch: true },
        );

        const result = await runSQLMigrations(pool, [modifiedMigration]);

        assert.deepStrictEqual(result.skipped, [modifiedMigration]);

        const { sql_hash: recordedHash } = await single(
          pool.execute.query<{ sql_hash: string }>(
            SQL`SELECT sql_hash FROM dmb_migrations WHERE name = 'ignored_hash_check_migration'`,
          ),
        );
        assert.strictEqual(recordedHash, initialHash);
      });

      it('handles a large migration with multiple SQL statements', async () => {
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

        await runSQLMigrations(pool, [migration]);

        const table1Exists = await tableExists(pool.execute, 'large_table_1');
        const table2Exists = await tableExists(pool.execute, 'large_table_2');
        const table3Exists = await tableExists(pool.execute, 'large_table_3');
        const table4Exists = await tableExists(pool.execute, 'large_table_4');

        assert.ok(table1Exists, 'The large_table_1 table should exist.');
        assert.ok(table2Exists, 'The large_table_2 table should exist.');
        assert.ok(table3Exists, 'The large_table_3 table should exist.');
        assert.ok(table4Exists, 'The large_table_4 table should exist.');
      });
    });
  }
});
