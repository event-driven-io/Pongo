import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { pgConnection } from '.';
import { executeSQL } from '../../execute';
import { rawSql } from '../../sql';
import { endPool, getPool } from '../pool';

void describe('PostgreSQL connection', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    connectionString = postgres.getConnectionUri();
  });

  after(async () => {
    await postgres.stop();
  });

  void describe('executeSQL', () => {
    void it('connects using pool', async () => {
      const connection = pgConnection({ connectionString });

      try {
        await executeSQL(connection.pool, rawSql('SELECT 1'));
      } catch (error) {
        console.log(error);
      } finally {
        await connection.close();
      }
    });

    void it('connects using connected pool client', async () => {
      const connection = pgConnection({ connectionString });
      const poolClient = await connection.open();

      try {
        await executeSQL(poolClient, rawSql('SELECT 1'));
      } finally {
        await connection.close();
      }
    });

    void it('connects using existing pool', async () => {
      const pool = getPool(connectionString);
      const connection = pgConnection({ connectionString, pool });

      try {
        await executeSQL(pool, rawSql('SELECT 1'));
      } finally {
        await connection.close();
        await endPool({ connectionString });
      }
    });

    void it('connects using client', async () => {
      const connection = pgConnection({
        connectionString,
        type: 'client',
      });
      const client = await connection.open();

      try {
        await executeSQL(client, rawSql('SELECT 1'));
      } finally {
        await connection.close();
      }
    });

    void it('connects using connected client', async () => {
      const existingClient = new pg.Client({ connectionString });
      await existingClient.connect();

      const connection = pgConnection({
        connectionString,
        client: existingClient,
      });
      const client = await connection.open();

      try {
        await executeSQL(client, rawSql('SELECT 1'));
      } finally {
        await connection.close();
        await existingClient.end();
      }
    });
  });
});
