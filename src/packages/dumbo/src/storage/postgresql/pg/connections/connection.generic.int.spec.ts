import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import { afterAll, beforeAll, describe, it } from 'vitest';
import pg from 'pg';
import { pgDumboDriver } from '..';
import { SQL } from '../../../../core';
import { dumbo } from '../../../all';
import { endPgPool, getPgPool } from './pool';

describe('pg', () => {
  let postgres: StartedPostgreSqlContainer;
  let connectionString: string;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    connectionString = postgres.getConnectionUri();
  });

  afterAll(async () => {
    await postgres.stop();
  });

  describe('pgPool', () => {
    it('connects using default pool', async () => {
      const pool = dumbo({ connectionString, driver: pgDumboDriver });
      const connection = await pool.connection();

      try {
        await connection.execute.query(SQL`SELECT 1`);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('does not close a supplied native pool when the generic pool closes', async () => {
      const nativePool = getPgPool(connectionString);
      const pool = dumbo({
        connectionString,
        pool: nativePool,
        driver: pgDumboDriver,
      });

      try {
        const connection = await pool.connection();
        try {
          await connection.execute.query(SQL`SELECT 1`);
        } finally {
          await connection.close();
          await pool.close();
        }

        const result = await nativePool.query<{ value: number }>(
          'SELECT 1 AS value',
        );
        assert.deepStrictEqual(result.rows, [{ value: 1 }]);
      } finally {
        await endPgPool({ connectionString });
      }
    });

    it('connects using client', async () => {
      const pool = dumbo({
        connectionString,
        pooled: false,
        driver: pgDumboDriver,
      });
      const connection = await pool.connection();

      try {
        await connection.execute.query(SQL`SELECT 1`);
      } finally {
        await connection.close();
        await pool.close();
      }
    });

    it('does not close a supplied client when the generic pool closes', async () => {
      const existingClient = new pg.Client({ connectionString });
      await existingClient.connect();

      const pool = dumbo({
        connectionString,
        client: existingClient,
        driver: pgDumboDriver,
      });
      try {
        const connection = await pool.connection();
        try {
          await connection.execute.query(SQL`SELECT 1`);
        } finally {
          await connection.close();
          await pool.close();
        }

        const result = await existingClient.query<{ value: number }>(
          'SELECT 1 AS value',
        );
        assert.deepStrictEqual(result.rows, [{ value: 1 }]);
      } finally {
        await existingClient.end();
      }
    });

    it('does not close a supplied connection when the generic pool closes', async () => {
      const ambientPool = dumbo({ connectionString, driver: pgDumboDriver });
      const ambientConnection = await ambientPool.connection();
      await ambientConnection.open();

      const pool = dumbo({
        connectionString,
        connection: ambientConnection,
        driver: pgDumboDriver,
      });

      try {
        try {
          await pool.execute.query(SQL`SELECT 1`);
        } finally {
          await pool.close();
        }

        await ambientConnection.execute.query(SQL`SELECT 1`);
      } finally {
        await ambientConnection.close();
        await ambientPool.close();
      }
    });

    it('connects using connected ambient not-connected connection', async () => {
      const ambientPool = dumbo({ connectionString, driver: pgDumboDriver });
      const ambientConnection = await ambientPool.connection();

      const pool = dumbo({
        connectionString,
        connection: ambientConnection,
        driver: pgDumboDriver,
      });

      try {
        await pool.execute.query(SQL`SELECT 1`);
      } finally {
        await pool.close();
        await ambientConnection.close();
        await ambientPool.close();
      }
    });

    it('connects using ambient connected connection with transaction', async () => {
      const ambientPool = dumbo({ connectionString, driver: pgDumboDriver });
      const ambientConnection = await ambientPool.connection();
      await ambientConnection.open();

      try {
        await ambientConnection.withTransaction<void>(async () => {
          const pool = dumbo({
            connectionString,
            connection: ambientConnection,
            driver: pgDumboDriver,
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

    it('connects using ambient not-connected connection with transaction', async () => {
      const ambientPool = dumbo({ connectionString, driver: pgDumboDriver });
      const ambientConnection = await ambientPool.connection();

      try {
        await ambientConnection.withTransaction<void>(async () => {
          const pool = dumbo({
            connectionString,
            connection: ambientConnection,
            driver: pgDumboDriver,
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

    it('connects using ambient connection in withConnection scope', async () => {
      const ambientPool = dumbo({ connectionString, driver: pgDumboDriver });
      try {
        await ambientPool.withConnection(async (ambientConnection) => {
          const pool = dumbo({
            connectionString,
            connection: ambientConnection,
            driver: pgDumboDriver,
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

    it('connects using ambient connection in withConnection and withTransaction scope', async () => {
      const ambientPool = dumbo({ connectionString, driver: pgDumboDriver });
      try {
        await ambientPool.withConnection((ambientConnection) =>
          ambientConnection.withTransaction(async () => {
            const pool = dumbo({
              connectionString,
              connection: ambientConnection,
              driver: pgDumboDriver,
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
  });
});
