import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import assert from 'assert';
import { aroundEach, describe, it } from 'vitest';
import {
  cloudflareDurableObjectSQLiteClient,
  CloudflareDurableObjectSQLiteDriverType,
  type CloudflareDurableObjectSQLiteDumboOptions,
} from '../../../../cloudflare';
import { dumbo, JSONSerializer, SQL } from '../../../../index';

describe('Cloudflare Durable Object SQLite Dumbo pool', () => {
  let storage: DurableObjectStorage;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      storage = state.storage;
      await runTest();
    });
  });

  it('returns the singleton client', async () => {
    const pool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      storage,
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

  it('connects using real Durable Object storage', async () => {
    const pool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      storage,
    });

    try {
      const result = await pool.execute.query<{ value: number }>(
        SQL`SELECT ${1} AS value`,
      );

      assert.deepStrictEqual(result.rows, [{ value: 1 }]);
    } finally {
      await pool.close();
    }
  });

  it('connects using typed options', async () => {
    const options: CloudflareDurableObjectSQLiteDumboOptions = {
      driverType: CloudflareDurableObjectSQLiteDriverType,
      storage,
    };
    const pool = dumbo(options);

    try {
      const result = await pool.execute.query<{ value: number }>(
        SQL`SELECT ${2} AS value`,
      );

      assert.deepStrictEqual(result.rows, [{ value: 2 }]);
    } finally {
      await pool.close();
    }
  });

  it('does not close a supplied client when the generic pool closes', async () => {
    const existingClient = cloudflareDurableObjectSQLiteClient({
      storage,
      serializer: JSONSerializer,
    });
    await existingClient.connect();

    const pool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      client: existingClient,
    });

    try {
      const connection = await pool.connection();
      try {
        const result = await connection.execute.query<{ value: number }>(
          SQL`SELECT ${3} AS value`,
        );

        assert.deepStrictEqual(result.rows, [{ value: 3 }]);
      } finally {
        await connection.close();
        await pool.close();
      }

      const result = await existingClient.query<{ value: number }>(
        SQL`SELECT 4 AS value`,
      );
      assert.deepStrictEqual(result.rows, [{ value: 4 }]);
    } finally {
      await existingClient.close();
    }
  });

  it('does not close a supplied connection when the generic pool closes', async () => {
    const ambientPool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      storage,
    });
    const ambientConnection = await ambientPool.connection();
    await ambientConnection.open();

    const pool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      connection: ambientConnection,
    });

    try {
      try {
        const result = await pool.execute.query<{ value: number }>(
          SQL`SELECT ${4} AS value`,
        );

        assert.deepStrictEqual(result.rows, [{ value: 4 }]);
      } finally {
        await pool.close();
      }

      const result = await ambientConnection.execute.query<{ value: number }>(
        SQL`SELECT ${5} AS value`,
      );
      assert.deepStrictEqual(result.rows, [{ value: 5 }]);
    } finally {
      await ambientConnection.close();
      await ambientPool.close();
    }
  });

  it('connects using an ambient not-connected connection', async () => {
    const ambientPool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      storage,
    });
    const ambientConnection = await ambientPool.connection();

    const pool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      connection: ambientConnection,
    });

    try {
      const result = await pool.execute.query<{ value: number }>(
        SQL`SELECT ${6} AS value`,
      );

      assert.deepStrictEqual(result.rows, [{ value: 6 }]);
    } finally {
      await pool.close();
      await ambientConnection.close();
      await ambientPool.close();
    }
  });

  it('uses an ambient connected connection in a transaction', async () => {
    const ambientPool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      storage,
    });
    const ambientConnection = await ambientPool.connection();
    await ambientConnection.open();

    try {
      await ambientConnection.withTransaction(async () => {
        const pool = dumbo({
          driverType: CloudflareDurableObjectSQLiteDriverType,
          connection: ambientConnection,
        });

        try {
          const result = await pool.execute.query<{ value: number }>(
            SQL`SELECT ${7} AS value`,
          );

          assert.deepStrictEqual(result.rows, [{ value: 7 }]);
        } finally {
          await pool.close();
        }
      });
    } finally {
      await ambientConnection.close();
      await ambientPool.close();
    }
  });

  it('uses an ambient not-connected connection in a transaction', async () => {
    const ambientPool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      storage,
    });
    const ambientConnection = await ambientPool.connection();

    try {
      await ambientConnection.withTransaction(async () => {
        const pool = dumbo({
          driverType: CloudflareDurableObjectSQLiteDriverType,
          connection: ambientConnection,
        });

        try {
          const result = await pool.execute.query<{ value: number }>(
            SQL`SELECT ${7} AS value`,
          );

          assert.deepStrictEqual(result.rows, [{ value: 7 }]);
        } finally {
          await pool.close();
        }
      });
    } finally {
      await ambientConnection.close();
      await ambientPool.close();
    }
  });

  it('uses an ambient connection from withConnection', async () => {
    const ambientPool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      storage,
    });

    try {
      await ambientPool.withConnection(async (ambientConnection) => {
        const pool = dumbo({
          driverType: CloudflareDurableObjectSQLiteDriverType,
          connection: ambientConnection,
        });

        try {
          const result = await pool.execute.query<{ value: number }>(
            SQL`SELECT ${8} AS value`,
          );

          assert.deepStrictEqual(result.rows, [{ value: 8 }]);
        } finally {
          await pool.close();
        }
      });
    } finally {
      await ambientPool.close();
    }
  });

  it('uses an ambient connection from withConnection in a transaction', async () => {
    const ambientPool = dumbo({
      driverType: CloudflareDurableObjectSQLiteDriverType,
      storage,
    });

    try {
      await ambientPool.withConnection((ambientConnection) =>
        ambientConnection.withTransaction(async () => {
          const pool = dumbo({
            driverType: CloudflareDurableObjectSQLiteDriverType,
            connection: ambientConnection,
          });

          try {
            const result = await pool.execute.query<{ value: number }>(
              SQL`SELECT ${9} AS value`,
            );

            assert.deepStrictEqual(result.rows, [{ value: 9 }]);
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
