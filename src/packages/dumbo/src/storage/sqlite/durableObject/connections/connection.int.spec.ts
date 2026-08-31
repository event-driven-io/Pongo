import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'assert';
import { aroundEach, describe, it } from 'vitest';
import { JSONSerializer, SQL } from '../../../../core';
import { cloudflareDurableObjectSQLitePool } from '../pool';
import {
  cloudflareDurableObjectSQLiteClient,
  cloudflareDurableObjectSQLiteConnection,
} from './cloudflareDurableObjectSQLiteConnection';

describe('Cloudflare Durable Object SQLite pool', () => {
  let storage: DurableObjectStorage;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      await runTest();
    });
  });

  it('returns connections backed by the singleton client', async () => {
    const pool = cloudflareDurableObjectSQLitePool({ storage });
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

  it('calls SQL correctly using default config', async () => {
    const pool = cloudflareDurableObjectSQLitePool({ storage });

    try {
      const result = await pool.execute.query(SQL`SELECT 1`);
      assert.strictEqual(result.rowCount, 1);
      assert.deepStrictEqual(result.rows, [{ '1': 1 }]);
    } finally {
      await pool.close();
    }
  });

  it('connects directly using storage', async () => {
    const connection = cloudflareDurableObjectSQLiteConnection({
      storage,
      serializer: JSONSerializer,
    });

    try {
      await connection.execute.query(SQL`SELECT 1`);
    } finally {
      await connection.close();
    }
  });

  it('uses a supplied client as the singleton client', async () => {
    const existingClient = cloudflareDurableObjectSQLiteClient({
      storage,
      serializer: JSONSerializer,
    });
    await existingClient.connect();

    const pool = cloudflareDurableObjectSQLitePool({
      client: existingClient,
    });

    try {
      const connection = await pool.connection();
      const client = await connection.open();

      assert.strictEqual(client, existingClient);
      await pool.execute.query(SQL`SELECT 1`);
    } finally {
      await pool.close();
      await existingClient.close();
    }
  });

  it('connects using connected ambient connected connection from pool', async () => {
    const ambientPool = cloudflareDurableObjectSQLitePool({ storage });
    const ambientConnection = await ambientPool.connection();
    await ambientConnection.open();

    const pool = cloudflareDurableObjectSQLitePool({
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

  it('connects using connected ambient connected connection', async () => {
    const ambientConnection = cloudflareDurableObjectSQLiteConnection({
      storage,
      serializer: JSONSerializer,
    });
    await ambientConnection.open();

    try {
      const pool = cloudflareDurableObjectSQLitePool({
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

  it('withConnection on ambient pool does not close the ambient connection', async () => {
    const ambientConnection = cloudflareDurableObjectSQLiteConnection({
      storage,
      serializer: JSONSerializer,
    });
    await ambientConnection.open();

    try {
      const pool = cloudflareDurableObjectSQLitePool({
        connection: ambientConnection,
      });

      await pool.withConnection(async (connection) => {
        await connection.execute.query(SQL`SELECT 1`);
      });

      await pool.close();

      await ambientConnection.execute.query(SQL`SELECT 1`);
    } finally {
      await ambientConnection.close();
    }
  });

  it('connects using connected ambient not-connected connection', async () => {
    const ambientPool = cloudflareDurableObjectSQLitePool({ storage });
    const ambientConnection = await ambientPool.connection();

    const pool = cloudflareDurableObjectSQLitePool({
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

  it('connects using ambient connected connection with transaction', async () => {
    const ambientConnection = cloudflareDurableObjectSQLiteConnection({
      storage,
      serializer: JSONSerializer,
    });
    await ambientConnection.open();

    try {
      await ambientConnection.withTransaction(async () => {
        const pool = cloudflareDurableObjectSQLitePool({
          connection: ambientConnection,
        });
        try {
          await pool.execute.query(SQL`SELECT 1`);
        } finally {
          await pool.close();
        }
      });
    } finally {
      await ambientConnection.close();
    }
  });

  it('connects using ambient not-connected connection with transaction', async () => {
    const ambientPool = cloudflareDurableObjectSQLitePool({ storage });
    const ambientConnection = await ambientPool.connection();

    try {
      await ambientConnection.withTransaction(async () => {
        const pool = cloudflareDurableObjectSQLitePool({
          connection: ambientConnection,
        });
        try {
          await pool.execute.query(SQL`SELECT 1`);
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
    const ambientPool = cloudflareDurableObjectSQLitePool({ storage });
    try {
      await ambientPool.withConnection(async (ambientConnection) => {
        const pool = cloudflareDurableObjectSQLitePool({
          connection: ambientConnection,
        });
        try {
          await pool.execute.query(SQL`SELECT 1`);
        } finally {
          await pool.close();
        }
      });
    } finally {
      await ambientPool.close();
    }
  });

  it('connects using ambient connection in withConnection and withTransaction scope', async () => {
    const ambientPool = cloudflareDurableObjectSQLitePool({ storage });
    try {
      await ambientPool.withConnection((ambientConnection) =>
        ambientConnection.withTransaction(async () => {
          const pool = cloudflareDurableObjectSQLitePool({
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
