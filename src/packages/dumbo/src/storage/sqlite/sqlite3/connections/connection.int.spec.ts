import assert from 'assert';
import fs from 'fs';
import { afterEach, describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSONSerializer, SQL } from '../../../../core';
import {
  sqlite3Client,
  sqlite3Connection,
  sqlite3Pool,
} from '../../../../sqlite3';
import { InMemorySQLiteDatabase } from '../../core';

void describe('Node SQLite3 pool', () => {
  const inMemoryfileName: string = InMemorySQLiteDatabase;

  const testDatabasePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  const fileName = path.resolve(testDatabasePath, 'test.db');

  const testCases = [
    { testName: 'in-memory', fileName: inMemoryfileName },
    { testName: 'file', fileName: fileName },
  ];

  afterEach(() => {
    if (!fs.existsSync(fileName)) {
      return;
    }
    try {
      fs.unlinkSync(fileName);
      fs.unlinkSync(`${fileName}-shm`);
      fs.unlinkSync(`${fileName}-wal`);
    } catch (error) {
      console.log('Error deleting file:', error);
    }
  });

  void describe(`in-memory database`, () => {
    void it('returns the singleton connection', async () => {
      const pool = sqlite3Pool({
        fileName: inMemoryfileName,
      });
      const connection = await pool.connection();
      const otherConnection = await pool.connection();

      try {
        assert.strictEqual(connection, otherConnection);

        const client = await connection.open();
        const otherClient = await otherConnection.open();
        assert.strictEqual(client, otherClient);
      } finally {
        await connection.close();
        await otherConnection.close();
        await pool.close();
      }
    });
  });

  void describe(`file-based database`, () => {
    void it('returns the same connection from writer sub-pool', async () => {
      const pool = sqlite3Pool({
        fileName,
      });
      const connection = await pool.connection();
      const otherConnection = await pool.connection();

      try {
        assert.deepStrictEqual(connection, otherConnection);

        const client = await connection.open();
        const otherClient = await otherConnection.open();
        assert.deepStrictEqual(client, otherClient);
      } finally {
        await connection.close();
        await otherConnection.close();
        await pool.close();
      }
    });

    void it('returns the new connection for readonly option and no options', async () => {
      const pool = sqlite3Pool({
        fileName,
      });
      const connection = await pool.connection();
      const readonlyConnection = await pool.connection({ readonly: true });

      try {
        assert.notDeepStrictEqual(connection, readonlyConnection);

        const client = await connection.open();
        const otherClient = await readonlyConnection.open();
        assert.notDeepStrictEqual(client, otherClient);
      } finally {
        await connection.close();
        await readonlyConnection.close();
        await pool.close();
      }
    });

    void it('returns the new connection for readonly option and not readonly', async () => {
      const pool = sqlite3Pool({
        fileName,
      });
      const connection = await pool.connection({ readonly: false });
      const readonlyConnection = await pool.connection({ readonly: true });

      try {
        assert.notDeepStrictEqual(connection, readonlyConnection);

        const client = await connection.open();
        const otherClient = await readonlyConnection.open();
        assert.notDeepStrictEqual(client, otherClient);
      } finally {
        await connection.close();
        await readonlyConnection.close();
        await pool.close();
      }
    });

    void it('for singleton setting returns the singleton connection', async () => {
      const pool = sqlite3Pool({
        fileName,
        singleton: true,
      });
      const connection = await pool.connection();
      const otherConnection = await pool.connection();

      try {
        assert.strictEqual(connection, otherConnection);

        const client = await connection.open();
        const otherClient = await otherConnection.open();
        assert.strictEqual(client, otherClient);
      } finally {
        await connection.close();
        await otherConnection.close();
        await pool.close();
      }
    });
  });

  for (const { testName, fileName } of testCases) {
    void describe(`sqlite3Pool with ${testName} database`, () => {
      void it('connects using default pool', async () => {
        const pool = sqlite3Pool({
          fileName,
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
        const pool = sqlite3Pool({
          fileName,
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
        const existingClient = sqlite3Client({
          fileName,
          serializer: JSONSerializer,
        });
        await existingClient.connect();

        const pool = sqlite3Pool({
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
        const ambientPool = sqlite3Pool({
          fileName,
        });
        const ambientConnection = await ambientPool.connection();
        await ambientConnection.open();

        const pool = sqlite3Pool({
          fileName,
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
        const ambientConnection = sqlite3Connection({
          fileName,
          serializer: JSONSerializer,
        });
        await ambientConnection.open();

        try {
          const pool = sqlite3Pool({
            fileName,
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
        const ambientConnection = sqlite3Connection({
          fileName,
          serializer: JSONSerializer,
        });
        await ambientConnection.open();

        try {
          const pool = sqlite3Pool({
            fileName,
            connection: ambientConnection,
            transactionOptions: { allowNestedTransactions: true },
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
        const ambientConnection = sqlite3Connection({
          fileName,
          serializer: JSONSerializer,
        });
        await ambientConnection.open();

        try {
          const pool = sqlite3Pool({
            fileName,
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
        const ambientPool = sqlite3Pool({
          fileName,
        });
        const ambientConnection = await ambientPool.connection();

        const pool = sqlite3Pool({
          fileName,
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
        const ambientPool = sqlite3Pool({
          fileName,
        });
        const ambientConnection = await ambientPool.connection();
        await ambientConnection.open();

        try {
          await ambientConnection.withTransaction<void>(async () => {
            const pool = sqlite3Pool({
              fileName,
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
        const ambientPool = sqlite3Pool({
          fileName,
        });
        const ambientConnection = await ambientPool.connection();

        try {
          await ambientConnection.withTransaction<void>(async () => {
            const pool = sqlite3Pool({
              fileName,
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
        const ambientPool = sqlite3Pool({
          fileName,
        });
        try {
          await ambientPool.withConnection(async (ambientConnection) => {
            const pool = sqlite3Pool({
              fileName,
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
        const ambientPool = sqlite3Pool({
          fileName,
        });
        try {
          await ambientPool.withConnection((ambientConnection) =>
            ambientConnection.withTransaction<void>(async () => {
              const pool = sqlite3Pool({
                fileName,
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
  }
});
