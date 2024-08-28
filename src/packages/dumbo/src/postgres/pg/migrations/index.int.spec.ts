import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import { after, before, beforeEach, describe, it } from 'node:test';
import { runPostgreSQLMigrations } from '.';
import { type Dumbo, dumbo } from '../../..';
import { count, rawSql, sql } from '../../../core';
import { tableExists } from '../../core';
import { type Migration, MIGRATIONS_LOCK_ID } from '../../migrations';
import { acquireAdvisoryLock, releaseAdvisoryLock } from '../locks';

void describe('Migration Integration Tests', () => {
  let pool: Dumbo;
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    connectionString = postgres.getConnectionUri();
    pool = dumbo({ connectionString });
  });

  after(async () => {
    await pool.close();
    await postgres.stop();
  });

  beforeEach(async () => {
    await pool.execute.query(
      rawSql('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'),
    );
  });

  void it('should apply multiple migrations sequentially', async () => {
    const firstMigration: Migration = {
      name: 'initial_setup',
      sqls: [
        `
                CREATE TABLE users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL UNIQUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );`,
      ],
    };

    const secondMigration: Migration = {
      name: 'add_roles_table',
      sqls: [
        `
                CREATE TABLE roles (
                    id SERIAL PRIMARY KEY,
                    role_name VARCHAR(255) NOT NULL UNIQUE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                );`,
      ],
    };

    await runPostgreSQLMigrations(pool, [firstMigration, secondMigration], {
      lock: { options: { timeoutMs: 300 } },
    });

    const usersTableExists = await tableExists(pool, 'users');
    const rolesTableExists = await tableExists(pool, 'roles');

    assert.ok(usersTableExists, 'The users table should exist.');
    assert.ok(rolesTableExists, 'The roles table should exist.');
  });

  void it('should timeout if the advisory lock is not acquired within the specified time', async () => {
    const migration: Migration = {
      name: 'timeout_migration',
      sqls: [
        `CREATE TABLE timeout_table (
            id SERIAL PRIMARY KEY,
            data TEXT NOT NULL
        );`,
      ],
    };

    //Simulate holding the advisory lock
    const connection = await pool.connection();
    try {
      await acquireAdvisoryLock(connection.execute, {
        lockId: MIGRATIONS_LOCK_ID,
      });

      try {
        await runPostgreSQLMigrations(pool, [migration], {
          lock: { options: { timeoutMs: 300 } },
        });

        assert.fail('The migration should have timed out and not proceeded.');
      } catch (error) {
        assert.ok(error instanceof Error);
        assert.strictEqual(
          error.message,
          'Failed to acquire advisory lock within the specified timeout. Migration aborted.',
          'Should throw a timeout error.',
        );
      }
    } finally {
      await releaseAdvisoryLock(connection.execute, {
        lockId: MIGRATIONS_LOCK_ID,
      });
      await connection.close();
    }
  });

  void it('should ensure that advisory locks prevent failing on concurrent migrations', async () => {
    const migration: Migration = {
      name: 'concurrent_migration',
      sqls: [
        `
                CREATE TABLE concurrent_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
      ],
    };

    // Run the first migration but simulate long execution by not releasing the lock immediately
    const connection = await pool.connection();
    try {
      // Simulate other migration holding the advisory lock
      await acquireAdvisoryLock(connection.execute, {
        lockId: MIGRATIONS_LOCK_ID,
      });
      await Promise.all([
        runPostgreSQLMigrations(pool, [migration]),
        // simulate other projection running in parallel
        new Promise((resolve) => setTimeout(resolve, 100)).then(() =>
          releaseAdvisoryLock(connection.execute, {
            lockId: MIGRATIONS_LOCK_ID,
          }),
        ),
      ]); // This should wait due to the lock
    } finally {
      await connection.close();
    }
    const wasCreated = await tableExists(pool, 'concurrent_table');

    assert.ok(wasCreated, 'The concurrent_table should exist.');
  });

  void it('should correctly apply a migration if the hash matches the previous migration with the same name', async () => {
    const migration: Migration = {
      name: 'hash_check_migration',
      sqls: [
        `
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
      ],
    };

    await runPostgreSQLMigrations(pool, [migration]);

    // Attempt to run the same migration again with the same content
    await runPostgreSQLMigrations(pool, [migration]); // This should succeed without error

    const migrationCount = await count(
      pool.execute.query<{ count: number }>(
        sql(
          'SELECT COUNT(*)::int as count FROM migrations WHERE name = %L',
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
    const migration: Migration = {
      name: 'hash_check_migration',
      sqls: [
        `
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
      ],
    };

    await runPostgreSQLMigrations(pool, [migration]);

    const modifiedMigration: Migration = {
      ...migration,
      sqls: [
        `
                CREATE TABLE hash_table (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL,
                    extra_column INT
                );`,
      ],
    };

    try {
      await runPostgreSQLMigrations(pool, [modifiedMigration]);
      assert.fail('The migration should have failed due to a hash mismatch.');
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
    const migration: Migration = {
      name: 'large_migration',
      sqls: [
        `
                CREATE TABLE large_table_1 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
        `
                CREATE TABLE large_table_2 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
        `
                CREATE TABLE large_table_3 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
        `
                CREATE TABLE large_table_4 (
                    id SERIAL PRIMARY KEY,
                    data TEXT NOT NULL
                );`,
      ],
    };

    await runPostgreSQLMigrations(pool, [migration]);

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
