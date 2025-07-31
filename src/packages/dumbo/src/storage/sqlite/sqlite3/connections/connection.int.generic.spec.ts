import assert from 'assert';
import fs from 'fs';
import { afterEach, describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';
import { rawSql } from '../../../../core';
import { dumbo } from '../../../all';
import { InMemorySQLiteDatabase, SQLiteConnectionString } from '../../core';
import { sqlite3Client } from './connection';

void describe('Node SQLite pool', () => {
  const inMemoryfileName = InMemorySQLiteDatabase;

  const testDatabasePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
  );
  const fileName = path.resolve(testDatabasePath, 'test.db');
  const connectionString = SQLiteConnectionString(`file:${fileName}`);

  const testCases = [
    {
      testName: 'in-memory',
      connectionString: inMemoryfileName,
    },
    { testName: 'file', connectionString },
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
      const pool = dumbo({
        connectorType: `SQLite:sqlite3`,
        connectionString: inMemoryfileName,
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
  });

  void describe(`file-based database`, () => {
    void it('returns the new connection each time', async () => {
      const pool = dumbo({
        connectorType: `SQLite:sqlite3`,
        connectionString,
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
        connectorType: `SQLite:sqlite3`,
        connectionString,
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
  });

  for (const { testName, connectionString } of testCases) {
    void describe(`dumbo with ${testName} database`, () => {
      void it('connects using default pool', async () => {
        const pool = dumbo({
          connectorType: `SQLite:sqlite3`,
          connectionString,
        });
        const connection = await pool.connection();

        try {
          await connection.execute.query(rawSql('SELECT 1'));
        } catch (error) {
          console.log(error);
          assert.fail(error as Error);
        } finally {
          await connection.close();
          await pool.close();
        }
      });

      void it('connects using client', async () => {
        const pool = dumbo({
          connectorType: `SQLite:sqlite3`,
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
        const existingClient = sqlite3Client({ fileName });
        await existingClient.connect();

        const pool = dumbo({
          connectorType: `SQLite:sqlite3`,
          connectionString,
          client: existingClient,
        });
        const connection = await pool.connection();

        try {
          await connection.execute.query(rawSql('SELECT 1'));
        } finally {
          await connection.close();
          await pool.close();
          await existingClient.close();
        }
      });

      void it('connects using connected ambient connected connection', async () => {
        const ambientPool = dumbo({
          connectorType: `SQLite:sqlite3`,
          connectionString,
          fileName,
        });
        const ambientConnection = await ambientPool.connection();
        await ambientConnection.open();

        const pool = dumbo({
          connectorType: `SQLite:sqlite3`,
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
        const ambientPool = dumbo({
          connectorType: `SQLite:sqlite3`,
          connectionString,
        });
        const ambientConnection = await ambientPool.connection();

        const pool = dumbo({
          connectorType: `SQLite:sqlite3`,
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
        const ambientPool = dumbo({
          connectorType: `SQLite:sqlite3`,
          connectionString,
        });
        const ambientConnection = await ambientPool.connection();
        await ambientConnection.open();

        try {
          await ambientConnection.withTransaction<void>(async () => {
            const pool = dumbo({
              connectorType: `SQLite:sqlite3`,
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
        const ambientPool = dumbo({
          connectorType: `SQLite:sqlite3`,
          connectionString,
        });
        const ambientConnection = await ambientPool.connection();

        try {
          await ambientConnection.withTransaction<void>(async () => {
            const pool = dumbo({
              connectorType: `SQLite:sqlite3`,
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
        const ambientPool = dumbo({
          connectorType: `SQLite:sqlite3`,
          connectionString,
        });
        try {
          await ambientPool.withConnection(async (ambientConnection) => {
            const pool = dumbo({
              connectorType: `SQLite:sqlite3`,
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
        const ambientPool = dumbo({
          connectorType: `SQLite:sqlite3`,
          connectionString,
        });
        try {
          await ambientPool.withConnection((ambientConnection) =>
            ambientConnection.withTransaction<void>(async () => {
              const pool = dumbo({
                connectorType: `SQLite:sqlite3`,
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
    });
  }
});
