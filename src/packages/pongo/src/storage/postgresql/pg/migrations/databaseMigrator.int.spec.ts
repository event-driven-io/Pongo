import {
  dumbo,
  PendingMigrationsError,
  SQL,
  type Dumbo,
} from '@event-driven-io/dumbo';
import { PostgreSQLConnectionString } from '@event-driven-io/dumbo/pg';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'node:assert/strict';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from 'vitest';
import { pongoClient, type PongoClient } from '../../../../core';
import { databaseMigratorTests } from '../../../databaseMigratorTests';
import { pongoDriver } from '..';

describe('PostgreSQL database migration assurance', () => {
  let postgres: StartedPostgreSqlContainer;
  let pool: Dumbo;
  let connectionString: PostgreSQLConnectionString;
  let clients: PongoClient[];
  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = PostgreSQLConnectionString(postgres.getConnectionUri());
    pool = dumbo({ connectionString });
  });
  beforeEach(async () => {
    clients = [];
    await pool.execute.command(
      SQL`DROP SCHEMA public CASCADE; CREATE SCHEMA public`,
    );
  });
  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
  });
  afterAll(async () => {
    await pool?.close();
    await postgres?.stop();
  });
  it('assures recorded schema with a runtime role that cannot create database objects', async () => {
    const provisioner = pongoClient({
      driver: pongoDriver,
      connectionString,
      schema: { autoMigration: 'None' },
    });
    clients.push(provisioner);
    provisioner.db().collection('users');
    await provisioner.db().schema.migrate();
    await pool.execute.command(
      SQL`CREATE ROLE assurance_runtime LOGIN PASSWORD 'runtime-test'; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO assurance_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA public TO assurance_runtime`,
    );
    const runtimeUrl = new URL(connectionString);
    runtimeUrl.username = 'assurance_runtime';
    runtimeUrl.password = 'runtime-test';
    const runtime = pongoClient({
      driver: pongoDriver,
      connectionString: PostgreSQLConnectionString(runtimeUrl.toString()),
      schema: { autoMigration: 'None' },
    });
    clients.push(runtime);
    const db = runtime.db();
    const users = db.collection('users');
    await db.schema.ensureMigrated();
    assert.deepEqual(await users.find({}), []);
    db.collection('orders');
    await assert.rejects(db.schema.ensureMigrated(), (error: unknown) => {
      assert.ok(error instanceof PendingMigrationsError);
      assert.ok(
        error.pendingMigrations.some((migration) =>
          migration.name.includes('orders'),
        ),
      );
      return true;
    });
  });
  databaseMigratorTests({
    client: (autoMigration) => {
      const client = pongoClient({
        driver: pongoDriver,
        connectionString,
        schema: { autoMigration },
      });
      clients.push(client);
      return client;
    },
    tables: async () =>
      (
        await pool.execute.query<{ name: string }>(
          SQL`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
        )
      ).rows.map(({ name }) => name),
  });
});
