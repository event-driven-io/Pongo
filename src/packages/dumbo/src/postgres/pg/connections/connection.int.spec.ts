import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { nodePostgresPool } from '.';
import { rawSql } from '../../../core';
import { endPool, getPool } from './pool';

void describe('Node Postgresql', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    connectionString = postgres.getConnectionUri();
  });

  after(async () => {
    await postgres.stop();
  });

  void describe('nodePostgresPool', () => {
    void it('connects using default pool', async () => {
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

    void it('connects using ambient pool', async () => {
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
        pooled: false,
      });
      const connection = await pool.open();

      try {
        await connection.execute.query(rawSql('SELECT 1'));
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    void it('connects using ambient client', async () => {
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

    void it('connects using connected ambient connected connection', async () => {
      const ambientPool = nodePostgresPool({ connectionString });
      const ambientConnection = await ambientPool.open();
      await ambientConnection.open();

      const pool = nodePostgresPool({
        connectionString,
        connection: ambientConnection,
      });

      try {
        await pool.execute.query(rawSql('SELECT 1'));
      } finally {
        await pool.close();
        await ambientConnection.close();
        await ambientPool.close();
      }
    });

    void it('connects using connected ambient not-connected connection', async () => {
      const ambientPool = nodePostgresPool({ connectionString });
      const ambientConnection = await ambientPool.open();

      const pool = nodePostgresPool({
        connectionString,
        connection: ambientConnection,
      });

      try {
        await pool.execute.query(rawSql('SELECT 1'));
      } finally {
        await pool.close();
        await ambientConnection.close();
        await ambientPool.close();
      }
    });

    void it('connects using ambient connected connection with transaction', async () => {
      const ambientPool = nodePostgresPool({ connectionString });
      const ambientConnection = await ambientPool.open();
      await ambientConnection.open();

      try {
        await ambientConnection.withTransaction<void>(async () => {
          const pool = nodePostgresPool({
            connectionString,
            connection: ambientConnection,
          });
          try {
            await pool.execute.query(rawSql('SELECT 1'));

            return { success: true, result: undefined };
          } finally {
            await pool.close();
          }
        });
      } finally {
        await ambientConnection.close();
        await ambientPool.close();
      }
    });

    void it('connects using ambient not-connected connection with transaction', async () => {
      const ambientPool = nodePostgresPool({ connectionString });
      const ambientConnection = await ambientPool.open();

      try {
        await ambientConnection.withTransaction<void>(async () => {
          const pool = nodePostgresPool({
            connectionString,
            connection: ambientConnection,
          });
          try {
            await pool.execute.query(rawSql('SELECT 1'));

            return { success: true, result: undefined };
          } finally {
            await pool.close();
          }
        });
      } finally {
        await ambientConnection.close();
        await ambientPool.close();
      }
    });
  });
});
