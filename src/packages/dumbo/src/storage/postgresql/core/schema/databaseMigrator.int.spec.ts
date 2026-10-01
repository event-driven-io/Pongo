import assert from 'node:assert/strict';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  databaseMigrator,
  dumbo,
  PendingMigrationsError,
  schemaComponent,
  SQL,
  sqlMigration,
  type Dumbo,
} from '../../../..';
import { PostgreSQLConnectionString } from '..';
import { pgDumboDriver } from '../../pg';

const component = schemaComponent('test', {
  migrations: () => [
    sqlMigration('example:create', [SQL`CREATE TABLE example (id INTEGER)`]),
  ],
});

describe('PostgreSQL read-only database migration assurance', () => {
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
  it('reports missing migrations without creating history then assures provisioned history', async () => {
    const migrator = databaseMigrator({
      pool,
      component,
      autoMigration: 'None',
    });
    await assert.rejects(migrator.ensureMigrated(), PendingMigrationsError);
    const history = await pool.execute.query(
      SQL`SELECT to_regclass('dmb_migrations') AS relation`,
    );
    assert.equal(history.rows[0]?.relation, null);
    await migrator.migrate();
    await databaseMigrator({
      pool,
      component,
      autoMigration: 'None',
    }).ensureMigrated();
    const changed = schemaComponent('changed', {
      migrations: () => [
        sqlMigration('example:create', [SQL`CREATE TABLE example (id TEXT)`]),
      ],
    });
    await assert.rejects(
      databaseMigrator({
        pool,
        component: changed,
        autoMigration: 'None',
      }).ensureMigrated(),
      PendingMigrationsError,
    );
    await databaseMigrator({
      pool,
      component: changed,
      autoMigration: 'None',
      ignoreMigrationHashMismatch: true,
    }).ensureMigrated();
  });
  it('resolves unqualified history using the executor search path', async () => {
    await pool.withConnection(async (connection) => {
      const execute = connection.execute;
      await execute.command(
        SQL`CREATE SCHEMA alternate; SET search_path TO alternate`,
      );
      try {
        await databaseMigrator({ pool, component, execute }).migrate();
        await databaseMigrator({
          pool,
          component,
          execute,
          autoMigration: 'None',
        }).ensureMigrated();
      } finally {
        await execute.command(SQL`SET search_path TO public`);
      }
    });
  });
});
