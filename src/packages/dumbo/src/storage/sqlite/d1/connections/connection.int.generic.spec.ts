import type { D1Database } from '@cloudflare/workers-types';
import assert from 'assert';
import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { d1Client, useD1DumboDriver, type D1DumboOptions } from '..';
import { JSONSerializer, SQL } from '../../../../core';
import { dumbo } from '../../../all';

void describe('D1 SQLite pool', () => {
  let mf: Miniflare;
  let database: D1Database;
  useD1DumboDriver();

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db-id' },
    });
    database = await mf.getD1Database('DB');
  });

  afterEach(async () => {
    await mf.dispose();
  });

  void it('returns the new connection each time', async () => {
    const pool = dumbo({
      driverType: `SQLite:d1`,
      database,
    });
    const connection = await pool.connection();
    const otherConnection = await pool.connection();

    try {
      // Won't work for now as it's lazy loaded
      // assert.notDeepStrictEqual(connection, otherConnection);

      const client = await connection.open();
      const otherClient = await otherConnection.open();
      assert.notDeepStrictEqual(client, otherClient);
    } finally {
      await connection.close();
      await otherConnection.close();
      await pool.close();
    }
  });

  void it('for singleton setting returns the singleton connection', async () => {
    const pool = dumbo({
      driverType: `SQLite:d1`,
      database,
      singleton: true,
    });
    const connection = await pool.connection();
    const otherConnection = await pool.connection();

    try {
      // Won't work for now as it's lazy loaded
      // assert.strictEqual(connection, otherConnection);

      const client = await connection.open();
      const otherClient = await otherConnection.open();
      assert.strictEqual(client, otherClient);
    } finally {
      await connection.close();
      await otherConnection.close();
      await pool.close();
    }
  });

  void it('connects using default pool', async () => {
    const pool = dumbo({
      driverType: `SQLite:d1`,
      database,
    });
    const connection = await pool.connection();

    try {
      await connection.execute.query(SQL`SELECT 1`);
    } catch (error) {
      console.log(error);
      assert.fail(error as Error);
    } finally {
      await connection.close();
      await pool.close();
    }
  });

  void it('connects using client', async () => {
    const options: D1DumboOptions = {
      driverType: `SQLite:d1`,
      database,
    };

    const pool = dumbo(options);
    const connection = await pool.connection();

    try {
      await connection.execute.query(SQL`SELECT 1`);
    } finally {
      await connection.close();
      await pool.close();
    }
  });

  void it('connects using ambient client', async () => {
    const existingClient = d1Client({ database, serializer: JSONSerializer });
    await existingClient.connect();

    const pool = dumbo({
      driverType: `SQLite:d1`,
      database,
      client: existingClient,
    });
    const connection = await pool.connection();

    try {
      await connection.execute.query(SQL`SELECT 1`);
    } finally {
      await connection.close();
      await pool.close();
      await existingClient.close();
    }
  });

  void it('connects using connected ambient connected connection', async () => {
    const ambientPool = dumbo({
      driverType: `SQLite:d1`,
      database,
    });
    const ambientConnection = await ambientPool.connection();
    await ambientConnection.open();

    const pool = dumbo({
      driverType: `SQLite:d1`,
      database,
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

  void it('connects using connected ambient not-connected connection', async () => {
    const ambientPool = dumbo({
      driverType: `SQLite:d1`,
      database,
    });
    const ambientConnection = await ambientPool.connection();

    const pool = dumbo({
      driverType: `SQLite:d1`,
      database,
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
    const ambientPool = dumbo({
      driverType: `SQLite:d1`,
      database,
    });
    const ambientConnection = await ambientPool.connection();
    await ambientConnection.open();

    try {
      await ambientConnection.withTransaction<void>(async () => {
        const pool = dumbo({
          driverType: `SQLite:d1`,
          database,
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
    const ambientPool = dumbo({
      driverType: `SQLite:d1`,
      database,
    });
    const ambientConnection = await ambientPool.connection();

    try {
      await ambientConnection.withTransaction<void>(async () => {
        const pool = dumbo({
          driverType: `SQLite:d1`,
          database,
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
    const ambientPool = dumbo({
      driverType: `SQLite:d1`,
      database,
    });
    try {
      await ambientPool.withConnection(async (ambientConnection) => {
        const pool = dumbo({
          driverType: `SQLite:d1`,
          database,
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
    const ambientPool = dumbo({
      driverType: `SQLite:d1`,
      database,
    });
    try {
      await ambientPool.withConnection((ambientConnection) =>
        ambientConnection.withTransaction<void>(async () => {
          const pool = dumbo({
            driverType: `SQLite:d1`,
            database,
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
});
