import type { D1Database } from '@cloudflare/workers-types';
import assert from 'assert';
import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { JSONSerializer, SQL } from '../../../../core';
import { d1Pool } from '../pool';
import { d1Client } from './d1Client';
import { d1Connection } from './d1Connection';

void describe('Cloudflare d1 pool', () => {
  let mf: Miniflare;
  let database: D1Database;

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

  void it('returns the singleton connection', async () => {
    const pool = d1Pool({
      database,
    });
    const connection = await pool.connection();
    const otherConnection = await pool.connection();

    try {
      const client = await connection.open();
      const otherClient = await otherConnection.open();
      assert.strictEqual(client, otherClient);
    } finally {
      await connection.close();
      await otherConnection.close();
      await pool.close();
    }
  });
  void it('calls SQL correctly using default config', async () => {
    const pool = d1Pool({
      database,
    });
    const connection = await pool.connection();

    try {
      await connection.execute.query(SQL`SELECT 1`);
    } catch (error) {
      console.log(error);
      assert.fail();
    } finally {
      await connection.close();
      await pool.close();
    }
  });

  void it('connects using client', async () => {
    const pool = d1Pool({
      database,
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
    const existingClient = d1Client({ database, serializer: JSONSerializer });
    await existingClient.connect();

    const pool = d1Pool({
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

  void it('connects using connected ambient connected connection from pool', async () => {
    const ambientPool = d1Pool({
      database,
    });
    const ambientConnection = await ambientPool.connection();
    await ambientConnection.open();

    const pool = d1Pool({
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

  void it('connects using connected ambient connected connection', async () => {
    const ambientConnection = d1Connection({
      database,
      serializer: JSONSerializer,
    });
    await ambientConnection.open();

    try {
      const pool = d1Pool({
        database,
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

  void it('withConnection on ambient pool does not close the ambient connection', async () => {
    const ambientConnection = d1Connection({
      database,
      serializer: JSONSerializer,
    });
    await ambientConnection.open();

    try {
      const pool = d1Pool({
        database,
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
    const ambientPool = d1Pool({
      database,
    });
    const ambientConnection = await ambientPool.connection();

    const pool = d1Pool({
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

  void it('connects using ambient connected connection with transaction and session_based mode', async () => {
    const ambientPool = d1Pool({
      database,
      transactionOptions: { mode: 'session_based' },
    });
    const ambientConnection = await ambientPool.connection();
    await ambientConnection.open();

    try {
      await ambientConnection.withTransaction(async () => {
        const pool = d1Pool({
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

  void it('connects using ambient not-connected connection with transaction and session_based mode', async () => {
    const ambientPool = d1Pool({
      database,
      transactionOptions: { mode: 'session_based' },
    });
    const ambientConnection = await ambientPool.connection();

    try {
      await ambientConnection.withTransaction(async () => {
        const pool = d1Pool({
          database,
          connection: ambientConnection,
          transactionOptions: { mode: 'session_based' },
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
    const ambientPool = d1Pool({
      database,
    });
    try {
      await ambientPool.withConnection(async (ambientConnection) => {
        const pool = d1Pool({
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

  void it('connects using ambient connection in withConnection and withTransaction scope and session_based mode', async () => {
    const ambientPool = d1Pool({
      database,
      transactionOptions: { mode: 'session_based' },
    });
    try {
      await ambientPool.withConnection((ambientConnection) =>
        ambientConnection.withTransaction(
          async () => {
            const pool = d1Pool({
              database,
              connection: ambientConnection,
            });
            try {
              await pool.execute.query(SQL`SELECT 1`);
            } finally {
              await pool.close();
            }
          },
          { mode: 'session_based' },
        ),
      );
    } finally {
      await ambientPool.close();
    }
  });
});
