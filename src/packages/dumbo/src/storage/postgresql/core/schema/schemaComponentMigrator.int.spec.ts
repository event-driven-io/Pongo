import assert from 'node:assert/strict';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  schemaComponentMigrator,
  dumbo,
  PendingMigrationsError,
  schemaComponent,
  SQL,
  sqlMigration,
  type Dumbo,
} from '../../../..';
import { PostgreSQLConnectionString } from '..';
import { pgDumboDriver } from '../../pg';
import { tableExists } from './schema';

const users = schemaComponent('users', {
  migrations: () => [
    sqlMigration('users:create', [SQL`CREATE TABLE users (id INTEGER)`]),
  ],
});

describe('PostgreSQL schema component migrator', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Dumbo;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.0').start();
    pool = dumbo({
      connectionString: PostgreSQLConnectionString(
        container.getConnectionUri(),
      ),
      driver: pgDumboDriver,
    });
  });

  afterAll(async () => {
    await pool?.close();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.execute.command(
      SQL`DROP SCHEMA IF EXISTS ops CASCADE; DROP SCHEMA IF EXISTS alternate CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;`,
    );
  });

  it('reports pending migrations without creating migration history', async () => {
    const migrator = schemaComponentMigrator({ pool, component: users });

    await assert.rejects(migrator.ensureMigrated(), (error) => {
      assert.ok(error instanceof PendingMigrationsError);
      assert.deepEqual(
        error.pendingMigrations.map(({ name }) => name),
        ['users:create'],
      );
      return true;
    });

    assert.equal(await tableExists(pool.execute, 'dmb_migrations'), false);
  });

  it('accepts migrations that were applied', async () => {
    await schemaComponentMigrator({ pool, component: users }).migrate();
    const migrator = schemaComponentMigrator({ pool, component: users });

    await assert.doesNotReject(migrator.ensureMigrated());
  });

  it('finds migration history in a migration table in another database schema', async () => {
    const migrationTable = { schemaName: 'ops' };
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

  it('finds unqualified migration history through the search path of the configured executor', async () => {
    await pool.withConnection(async ({ execute }) => {
      await execute.command(
        SQL`CREATE SCHEMA alternate; SET search_path TO alternate`,
      );
      await schemaComponentMigrator({
        pool,
        component: users,
        execute,
      }).migrate();
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        execute,
      });

      await assert.doesNotReject(migrator.ensureMigrated());

      await execute.command(SQL`SET search_path TO public`);
    });
  });

  it('does not wait for the migration lock when migrations were already applied', async () => {
    const lock = { options: { lockId: 42, timeoutMS: 100 } };
    await schemaComponentMigrator({ pool, component: users, lock }).migrate();

    await pool.withConnection(async ({ execute }) => {
      await execute.query(SQL`SELECT pg_advisory_lock(42)`);
      const migrator = schemaComponentMigrator({
        pool,
        component: users,
        lock,
      });

      await assert.doesNotReject(migrator.migrate());

      await execute.query(SQL`SELECT pg_advisory_unlock(42)`);
    });
  });
});
