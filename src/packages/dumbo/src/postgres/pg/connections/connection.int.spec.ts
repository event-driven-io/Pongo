import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'node:assert';
import console from 'node:console';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { endPool, getPool, nodePostgresPool } from '.';
import { dumbo } from '../../..';
import { exists, rawSql, single, sql } from '../../../core';

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
      const connection = await pool.connection();

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
      const connection = await pool.connection();

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
      const connection = await pool.connection();

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
      const connection = await pool.connection();

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
      const ambientConnection = await ambientPool.connection();
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
      const ambientConnection = await ambientPool.connection();

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
      const ambientConnection = await ambientPool.connection();
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
      const ambientConnection = await ambientPool.connection();

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

    void it('connects using ambient connection in withConnection scope', async () => {
      const ambientPool = nodePostgresPool({ connectionString });
      try {
        await ambientPool.withConnection(async (ambientConnection) => {
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
        await ambientPool.close();
      }
    });

    void it('connects using ambient connection in withConnection and withTransaction scope', async () => {
      const ambientPool = nodePostgresPool({ connectionString });
      try {
        await ambientPool.withConnection((ambientConnection) =>
          ambientConnection.withTransaction<void>(async () => {
            const pool = nodePostgresPool({
              connectionString,
              connection: ambientConnection,
            });
            try {
              await pool.execute.query(rawSql('SELECT 1'));
            } finally {
              await pool.close();
            }
          }),
        );
      } finally {
        await ambientPool.close();
      }
    });

    void it('connects using ambient client in withConnection and withTransaction scope', async () => {
      const existingClient = new pg.Client({ connectionString });
      await existingClient.connect();

      const ambientPool = nodePostgresPool({
        connectionString,
        client: existingClient,
      });

      try {
        await ambientPool.withConnection((ambientConnection) =>
          ambientConnection.withTransaction<void>(async () => {
            const pool = nodePostgresPool({
              connectionString,
              connection: ambientConnection,
            });
            try {
              await pool.execute.query(rawSql('SELECT 1'));
            } finally {
              await pool.close();
            }
          }),
        );
      } finally {
        await ambientPool.close();
        await existingClient.end();
      }
    });
  });

  void it('connects using ambient client in withTransaction scope', async () => {
    const existingClient = new pg.Client({ connectionString });
    await existingClient.connect();

    const pool = dumbo({ connectionString });
    const ambientPool = nodePostgresPool({
      connectionString,
      client: existingClient,
      pooled: false,
    });

    const id = new Date().getTime();

    try {
      await ambientPool.withTransaction<void>(async ({ execute }) => {
        await execute.command(
          rawSql(`CREATE TABLE IF NOT EXISTS testambient (
                    id BIGINT PRIMARY KEY, 
                    brand VARCHAR(255)
                  )`),
        );
        await execute.command(
          sql(`INSERT INTO testambient (id, brand) VALUES (%s, 'bmw')`, id),
        );

        const result = await single(
          execute.query(
            sql('SELECT EXISTS (SELECT 1 from testambient WHERE id = %s)', id),
          ),
        );
        assert.ok(result);
      });

      const result = await exists(
        pool.execute.query(
          sql('SELECT EXISTS (SELECT 1 from testambient WHERE id = %s)', id),
        ),
      );
      assert.ok(result);
    } catch (error) {
      console.log(error);
      throw error;
    } finally {
      await ambientPool.close();
      await pool.close();
      await existingClient.end();
    }
  });
});
