import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
  schemaComponentMigrator,
  dumbo,
  PendingMigrationsError,
  schemaComponent,
  SQL,
  sqlMigration,
  type Dumbo,
} from '../../../..';
import { SQLite3DriverType } from '../../sqlite3';
import { InMemorySQLiteDatabase } from '..';
import { tableExists } from './schema';

const users = schemaComponent('users', {
  migrations: () => [
    sqlMigration('users:create', [SQL`CREATE TABLE users (id INTEGER)`]),
  ],
});

const usersWithChangedSQL = schemaComponent('users', {
  migrations: () => [
    sqlMigration('users:create', [SQL`CREATE TABLE users (id TEXT)`]),
  ],
});

const assertRejectsWithPendingMigrations = (
  operation: Promise<unknown>,
  migrationNames: string[],
) =>
  assert.rejects(operation, (error) => {
    assert.ok(error instanceof PendingMigrationsError);
    assert.deepEqual(
      error.pendingMigrations.map(({ name }) => name),
      migrationNames,
    );
    return true;
  });

describe('SQLite schema component migrator', () => {
  let pool: Dumbo;

  beforeEach(() => {
    pool = dumbo({
      connectionString: InMemorySQLiteDatabase,
      driverType: SQLite3DriverType,
    });
  });

  afterEach(async () => {
    await pool.close();
  });

  describe('ensuring migrations', () => {
    it('reports pending migrations without applying them', async () => {
      const migrator = schemaComponentMigrator({ pool, component: users });

      await assertRejectsWithPendingMigrations(migrator.ensureMigrated(), [
        'users:create',
      ]);

      assert.equal(await tableExists(pool.execute, 'users'), false);
    });

    it('accepts migrations that were applied', async () => {
      await schemaComponentMigrator({ pool, component: users }).migrate();
      const migrator = schemaComponentMigrator({ pool, component: users });

      await assert.doesNotReject(migrator.ensureMigrated());
    });

    it('does not access the database again after migrations were confirmed', async () => {
      await schemaComponentMigrator({ pool, component: users }).migrate();
      const migrator = schemaComponentMigrator({ pool, component: users });
      await migrator.ensureMigrated();
      await pool.close();

      await assert.doesNotReject(migrator.ensureMigrated());
    });

    it('reports a migration whose SQL changed after it was applied', async () => {
      await schemaComponentMigrator({ pool, component: users }).migrate();
      const migrator = schemaComponentMigrator({
        pool,
        component: usersWithChangedSQL,
      });

      await assertRejectsWithPendingMigrations(migrator.ensureMigrated(), [
        'users:create',
      ]);
    });

    it('accepts changed SQL when the migrator ignores hash mismatches', async () => {
      await schemaComponentMigrator({ pool, component: users }).migrate();
      const migrator = schemaComponentMigrator({
        pool,
        component: usersWithChangedSQL,
        ignoreMigrationHashMismatch: true,
      });

      await assert.doesNotReject(migrator.ensureMigrated());
    });

    it('accepts changed SQL when the migration ignores hash mismatches', async () => {
      await schemaComponentMigrator({ pool, component: users }).migrate();
      const migrator = schemaComponentMigrator({
        pool,
        component: schemaComponent('users', {
          migrations: () => [
            sqlMigration('users:create', [SQL`CREATE TABLE users (id TEXT)`], {
              ignoreHashMismatch: true,
            }),
          ],
        }),
      });

      await assert.doesNotReject(migrator.ensureMigrated());
    });

    it('finds migration history in the configured migration table', async () => {
      const migrationTable = { tableName: 'app_migrations' };
      await schemaComponentMigrator({
        pool,
        component: users,
        migrationTable,
      }).migrate();
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        migrationTable,
      });

      await assert.doesNotReject(migrator.ensureMigrated());
    });
  });

  describe('migrating with automatic migration disabled', () => {
    it('reports pending migrations without applying them', async () => {
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        autoMigration: 'None',
      });

      await assertRejectsWithPendingMigrations(migrator.migrate(), [
        'users:create',
      ]);

      assert.equal(await tableExists(pool.execute, 'users'), false);
    });

    it('accepts migrations that were applied', async () => {
      await schemaComponentMigrator({ pool, component: users }).migrate();
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        autoMigration: 'None',
      });

      await assert.doesNotReject(migrator.migrate());
    });

    it('applies pending migrations when the call allows creating them', async () => {
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        autoMigration: 'None',
      });

      await migrator.migrate({ migrationStyle: 'CreateOrUpdate' });

      assert.equal(await tableExists(pool.execute, 'users'), true);
    });
  });

  describe('migrating', () => {
    it('applies pending migrations', async () => {
      const migrator = schemaComponentMigrator({ pool, component: users });

      await migrator.migrate();

      assert.equal(await tableExists(pool.execute, 'users'), true);
    });

    it('applies pending migrations for concurrent calls', async () => {
      const migrator = schemaComponentMigrator({ pool, component: users });

      await Promise.all([migrator.migrate(), migrator.migrate()]);

      assert.equal(await tableExists(pool.execute, 'users'), true);
    });

    it('reports pending migrations when the call disables migrations', async () => {
      const migrator = schemaComponentMigrator({ pool, component: users });

      await assertRejectsWithPendingMigrations(
        migrator.migrate({ migrationStyle: 'None' }),
        ['users:create'],
      );

      assert.equal(await tableExists(pool.execute, 'users'), false);
    });

    it('does not access the database again after migrations were applied', async () => {
      const migrator = schemaComponentMigrator({ pool, component: users });
      await migrator.migrate();
      await pool.close();

      await assert.doesNotReject(migrator.migrate());
    });

    it('does not access the database after migrations were confirmed', async () => {
      await schemaComponentMigrator({ pool, component: users }).migrate();
      const migrator = schemaComponentMigrator({ pool, component: users });
      await migrator.ensureMigrated();
      await pool.close();

      await assert.doesNotReject(migrator.migrate());
    });

    it('applies migrations again after the caller rolled back its transaction', async () => {
      const migrator = schemaComponentMigrator({ pool, component: users });
      await pool.withTransaction(async ({ execute }) => {
        await migrator.migrate({ execute });
        return { success: false, result: undefined };
      });

      await migrator.migrate();

      assert.equal(await tableExists(pool.execute, 'users'), true);
    });

    it('applies migrations after a dry run', async () => {
      const migrator = schemaComponentMigrator({ pool, component: users });
      await migrator.migrate({ dryRun: true });

      await migrator.migrate();

      assert.equal(await tableExists(pool.execute, 'users'), true);
    });

    it('applies migrations after a configured dry run', async () => {
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        dryRun: true,
      });
      await migrator.migrate();

      await migrator.migrate({ dryRun: false });

      assert.equal(await tableExists(pool.execute, 'users'), true);
    });

    it('retries migrations that failed on an earlier call', async () => {
      const migrator = schemaComponentMigrator({
        pool,
        component: schemaComponent('copies', {
          migrations: () => [
            sqlMigration('copies:create', [
              SQL`CREATE TABLE copies AS SELECT id FROM originals`,
            ]),
          ],
        }),
      });
      await assert.rejects(migrator.migrate(), /originals/);
      await pool.execute.command(SQL`CREATE TABLE originals (id INTEGER)`);

      await migrator.migrate();

      assert.equal(await tableExists(pool.execute, 'copies'), true);
    });

    it('rolls back every statement of a failed migration', async () => {
      const migrator = schemaComponentMigrator({
        pool,
        component: schemaComponent('users', {
          migrations: () => [
            sqlMigration('users:create', [
              SQL`CREATE TABLE users (id INTEGER)`,
              SQL`INSERT INTO missing_table VALUES (1)`,
            ]),
          ],
        }),
      });

      await assert.rejects(migrator.migrate(), /missing_table/);

      assert.equal(await tableExists(pool.execute, 'users'), false);
    });

    it('does not apply migrations in a dry run', async () => {
      const migrator = schemaComponentMigrator({ pool, component: users });

      await migrator.migrate({ dryRun: true });

      assert.equal(await tableExists(pool.execute, 'users'), false);
    });

    it('does not apply migrations in a dry run on the configured executor', async () => {
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        execute: pool.execute,
      });

      await migrator.migrate({ dryRun: true });

      assert.equal(await tableExists(pool.execute, 'users'), false);
    });

    it('keeps the configured dry run when a call passes undefined', async () => {
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        dryRun: true,
      });

      await migrator.migrate({ dryRun: undefined });

      assert.equal(await tableExists(pool.execute, 'users'), false);
    });

    it('applies migrations when a call overrides the configured dry run', async () => {
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        dryRun: true,
      });

      await migrator.migrate({ dryRun: false });

      assert.equal(await tableExists(pool.execute, 'users'), true);
    });

    it('keeps ignoring hash mismatches when a call passes undefined', async () => {
      await schemaComponentMigrator({ pool, component: users }).migrate();
      const migrator = schemaComponentMigrator({
        pool,
        component: usersWithChangedSQL,
        ignoreMigrationHashMismatch: true,
      });

      await assert.doesNotReject(
        migrator.migrate({ ignoreMigrationHashMismatch: undefined }),
      );
    });
  });
});
