import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { pgPool } from '.';
import { SQL } from '../../../../core';
import { pgConnection } from './connection';
import { endPgPool, getPgPool } from './pool';

void describe('pg', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;

  before(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = postgres.getConnectionUri();
  });

  after(async () => {
    await postgres.stop();
  });

  void describe('pgPool', () => {
    void it('connects using default pool', async () => {
      const pool = pgPool({ connectionString });
      const connection = await pool.connection();

      try {
        await connection.execute.query(SQL`SELECT 1`);
      } catch (error) {
        console.log(error);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    void it('connects using ambient pool', async () => {
      const nativePool = getPgPool(connectionString);
      const pool = pgPool({ connectionString, pool: nativePool });
      const connection = await pool.connection();

      try {
        await connection.execute.query(SQL`SELECT 1`);
      } finally {
        await connection.close();
        await pool.close();
        await endPgPool({ connectionString });
      }
    });

    void it('connects using client', async () => {
      const pool = pgPool({
        connectionString,
        pooled: false,
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(SQL`SELECT 1`);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    void it('connects using ambient client', async () => {
      const existingClient = new pg.Client({ connectionString });
      await existingClient.connect();

      const pool = pgPool({
        connectionString,
        client: existingClient,
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(SQL`SELECT 1`);
      } finally {
        await connection.close();
        await pool.close();
        await existingClient.end();
      }
    });

    void it('connects using connected ambient connected connection from pool', async () => {
      const ambientPool = pgPool({ connectionString });
      const ambientConnection = await ambientPool.connection();
      await ambientConnection.open();

      const pool = pgPool({
        connectionString,
        connection: ambientConnection,
      });

      try {
        await pool.execute.query(SQL`SELECT 1`);
      } finally {
        await pool.close();
        await ambientConnection.close();
        await ambientPool.close();
      }
    });

    void it('connects using connected ambient connected connection', async () => {
      const client = new pg.Client({ connectionString });
      await client.connect();

      const ambientConnection = pgConnection({
        type: 'Client',
        connect: () => Promise.resolve(client),
        close: () => client.end(),
        serializer: {} as never,
      });
      await ambientConnection.open();

      try {
        const pool = pgPool({
          connectionString,
          connection: ambientConnection,
        });

        try {
          await pool.execute.query(SQL`SELECT 1`);
        } finally {
          await pool.close();
        }

        await ambientConnection.execute.query(SQL`SELECT 1`);
      } finally {
        await ambientConnection.close();
      }
    });

    void it('connects using connected ambient connected connection and using transaction on pool', async () => {
      const client = new pg.Client({ connectionString });
      await client.connect();

      const ambientConnection = pgConnection({
        type: 'Client',
        connect: () => Promise.resolve(client),
        close: () => client.end(),
        serializer: {} as never,
      });
      await ambientConnection.open();

      try {
        const pool = pgPool({
          connectionString,
          connection: ambientConnection,
        });

        try {
          await pool.withTransaction(async (tx) => {
            await tx.execute.query(SQL`SELECT 1`);
          });
        } finally {
          await pool.close();
        }

        await ambientConnection.withTransaction(async (tx) => {
          await tx.execute.query(SQL`SELECT 1`);
        });
      } finally {
        await ambientConnection.close();
      }
    });

    void it('withConnection on ambient pool does not close the ambient connection', async () => {
      const client = new pg.Client({ connectionString });
      await client.connect();

      const ambientConnection = pgConnection({
        type: 'Client',
        connect: () => Promise.resolve(client),
        close: () => client.end(),
        serializer: {} as never,
      });
      await ambientConnection.open();

      try {
        const pool = pgPool({
          connectionString,
          connection: ambientConnection,
        });

        await pool.withConnection(async (conn) => {
          await conn.execute.query(SQL`SELECT 1`);
        });

        await pool.close();

        await ambientConnection.execute.query(SQL`SELECT 1`);
      } finally {
        await ambientConnection.close();
      }
    });

    void it('connects using connected ambient not-connected connection', async () => {
      const ambientPool = pgPool({ connectionString });
      const ambientConnection = await ambientPool.connection();

      const pool = pgPool({
        connectionString,
        connection: ambientConnection,
      });

      try {
        await pool.execute.query(SQL`SELECT 1`);
      } finally {
        await pool.close();
        await ambientConnection.close();
        await ambientPool.close();
      }
    });

    void it('connects using ambient connected connection with transaction', async () => {
      const ambientPool = pgPool({ connectionString });
      const ambientConnection = await ambientPool.connection();
      await ambientConnection.open();

      try {
        await ambientConnection.withTransaction<void>(async () => {
          const pool = pgPool({
            connectionString,
            connection: ambientConnection,
          });
          try {
            await pool.execute.query(SQL`SELECT 1`);

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
      const ambientPool = pgPool({ connectionString });
      const ambientConnection = await ambientPool.connection();

      try {
        await ambientConnection.withTransaction<void>(async () => {
          const pool = pgPool({
            connectionString,
            connection: ambientConnection,
          });
          try {
            await pool.execute.query(SQL`SELECT 1`);

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
      const ambientPool = pgPool({ connectionString });
      try {
        await ambientPool.withConnection(async (ambientConnection) => {
          const pool = pgPool({
            connectionString,
            connection: ambientConnection,
          });
          try {
            await pool.execute.query(SQL`SELECT 1`);

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
      const ambientPool = pgPool({ connectionString });
      try {
        await ambientPool.withConnection((ambientConnection) =>
          ambientConnection.withTransaction<void>(async () => {
            const pool = pgPool({
              connectionString,
              connection: ambientConnection,
            });
            try {
              await pool.execute.query(SQL`SELECT 1`);
            } finally {
              await pool.close();
            }
          }),
        );
      } finally {
        await ambientPool.close();
      }
    });

    void it('accepts isolation level in transaction options', async () => {
      const pool = pgPool({ connectionString });
      try {
        await pool.withTransaction(
          async (tx) => {
            await tx.execute.query(SQL`SELECT 1`);
          },
          { isolationLevel: 'READ COMMITTED' },
        );
      } finally {
        await pool.close();
      }
    });

    void it('accepts readonly in transaction options', async () => {
      const pool = pgPool({ connectionString });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_readonly (id INTEGER PRIMARY KEY, value TEXT)`,
        );
        await pool.execute.command(
          SQL`INSERT INTO test_readonly (id, value) VALUES (1, 'test')`,
        );

        await pool.withTransaction(
          async (tx) => {
            const result = await tx.execute.query(
              SQL`SELECT value FROM test_readonly WHERE id = 1`,
            );
            if (result.rows[0]?.value !== 'test') {
              throw new Error('Read-only transaction query failed');
            }
          },
          { readonly: true },
        );

        await pool.execute.command(SQL`DROP TABLE test_readonly`);
      } finally {
        await pool.close();
      }
    });

    void it('accepts both isolation level and readonly in transaction options', async () => {
      const pool = pgPool({ connectionString });
      try {
        await pool.execute.command(
          SQL`CREATE TABLE IF NOT EXISTS test_iso_readonly (id INTEGER PRIMARY KEY, value TEXT)`,
        );
        await pool.execute.command(
          SQL`INSERT INTO test_iso_readonly (id, value) VALUES (1, 'test')`,
        );

        await pool.withTransaction(
          async (tx) => {
            const result = await tx.execute.query(
              SQL`SELECT value FROM test_iso_readonly WHERE id = 1`,
            );
            if (result.rows[0]?.value !== 'test') {
              throw new Error('Transaction query failed');
            }
          },
          { isolationLevel: 'SERIALIZABLE', readonly: true },
        );

        await pool.execute.command(SQL`DROP TABLE test_iso_readonly`);
      } finally {
        await pool.close();
      }
    });
  });
});
