import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { nodePostgresPool } from '.';
import { rawSql } from '../../sql';
import { endPool, getPool } from './pool';

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
      const pool = nodePostgresPool({ connectionString });
      const connection = await pool.open();

      try {
        await connection.execute.query(rawSql('SELECT 1'));
      } catch (error) {
        console.log(error);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    void it('connects using existing pool', async () => {
      const nativePool = getPool(connectionString);
      const pool = nodePostgresPool({ connectionString, pool: nativePool });
      const connection = await pool.open();

      try {
        await connection.execute.query(rawSql('SELECT 1'));
      } finally {
        await connection.close();
        await pool.close();
        await endPool({ connectionString });
      }
    });

    void it('connects using client', async () => {
      const pool = nodePostgresPool({
        connectionString,
        type: 'client',
      });
      const connection = await pool.open();

      try {
        await connection.execute.query(rawSql('SELECT 1'));
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    void it('connects using connected client', async () => {
      const existingClient = new pg.Client({ connectionString });
      await existingClient.connect();

      const pool = nodePostgresPool({
        connectionString,
        client: existingClient,
      });
      const connection = await pool.open();

      try {
        await connection.execute.query(rawSql('SELECT 1'));
      } finally {
        await connection.close();
        await pool.close();
        await existingClient.end();
      }
    });
  });
});
