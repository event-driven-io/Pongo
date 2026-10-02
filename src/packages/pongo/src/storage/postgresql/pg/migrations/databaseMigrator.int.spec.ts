import { dumbo, SQL, type Dumbo } from '@event-driven-io/dumbo';
import { PostgreSQLConnectionString } from '@event-driven-io/dumbo/pg';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { afterAll, afterEach, beforeAll, beforeEach, describe } from 'vitest';
import { pongoClient, type PongoClient } from '../../../../core';
import { databaseMigratorTests } from '../../../databaseMigratorTests';
import { pongoDriver } from '..';

describe('PostgreSQL database migrator', () => {
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
