import assert from 'assert';
import fs from 'fs';
import { afterEach, describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { SQL } from '../../../../core';
import { InMemorySQLiteDatabase, sqlitePool } from '../../core';
import { sqlite3Client } from './connection';

void describe('Node SQLite pool', () => {
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
    } catch (error) {
      console.log('Error deleting file:', error);
    }
  });

  void describe(`in-memory database`, () => {
    void it('returns the singleton connection', async () => {
      const pool = sqlitePool({
        connector: 'SQLite:sqlite3',
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
    void it('returns the new connection each time', async () => {
      const pool = sqlitePool({ connector: 'SQLite:sqlite3', fileName });
      const connection = await pool.connection();
      const otherConnection = await pool.connection();

      try {
        assert.notDeepStrictEqual(connection, otherConnection);

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
      const pool = sqlitePool({
        connector: 'SQLite:sqlite3',
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
    void describe(`sqlitePool with ${testName} database`, () => {
      void it('connects using default pool', async () => {
        const pool = sqlitePool({ connector: 'SQLite:sqlite3', fileName });
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
        const pool = sqlitePool({
          connector: 'SQLite:sqlite3',
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
        const existingClient = sqlite3Client({ fileName });
        await existingClient.connect();

        const pool = sqlitePool({
          connector: 'SQLite:sqlite3',
          fileName,
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
        const ambientPool = sqlitePool({
          connector: 'SQLite:sqlite3',
          fileName,
        });
        const ambientConnection = await ambientPool.connection();
        await ambientConnection.open();

        const pool = sqlitePool({
          connector: 'SQLite:sqlite3',
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

      void it('connects using connected ambient not-connected connection', async () => {
        const ambientPool = sqlitePool({
          connector: 'SQLite:sqlite3',
          fileName,
        });
        const ambientConnection = await ambientPool.connection();

        const pool = sqlitePool({
          connector: 'SQLite:sqlite3',
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
        const ambientPool = sqlitePool({
          connector: 'SQLite:sqlite3',
          fileName,
        });
        const ambientConnection = await ambientPool.connection();
        await ambientConnection.open();

        try {
          await ambientConnection.withTransaction<void>(async () => {
            const pool = sqlitePool({
              connector: 'SQLite:sqlite3',
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
        const ambientPool = sqlitePool({
          connector: 'SQLite:sqlite3',
          fileName,
        });
        const ambientConnection = await ambientPool.connection();

        try {
          await ambientConnection.withTransaction<void>(async () => {
            const pool = sqlitePool({
              connector: 'SQLite:sqlite3',
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
        const ambientPool = sqlitePool({
          connector: 'SQLite:sqlite3',
          fileName,
        });
        try {
          await ambientPool.withConnection(async (ambientConnection) => {
            const pool = sqlitePool({
              connector: 'SQLite:sqlite3',
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
        const ambientPool = sqlitePool({
          connector: 'SQLite:sqlite3',
          fileName,
        });
        try {
          await ambientPool.withConnection((ambientConnection) =>
            ambientConnection.withTransaction<void>(async () => {
              const pool = sqlitePool({
                connector: 'SQLite:sqlite3',
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
