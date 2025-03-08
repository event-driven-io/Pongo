import { describe, it } from 'node:test';
import { rawSql } from '../../../../core';
import { InMemorySQLiteDatabase, sqlitePool } from '../../core';
import { sqlite3Client } from './connection';

void describe('Node SQLite', () => {
  // let postgres: StartedPostgreSqlContainer;
  const fileName: string = InMemorySQLiteDatabase;

  // before(async () => {
  //   postgres = await new PostgreSqlContainer().start();
  //   fileName = postgres.getConnectionUri();
  // });

  // after(async () => {
  //   await postgres.stop();
  // });

  void describe('sqlitePool', () => {
    void it('connects using default pool', async () => {
      const pool = sqlitePool({ connector: 'SQLite:sqlite3', fileName });
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

    void it('connects using client', async () => {
      const pool = sqlitePool({
        connector: 'SQLite:sqlite3',
        fileName,
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

      const pool = sqlitePool({
        connector: 'SQLite:sqlite3',
        fileName,
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
        await pool.execute.query(rawSql('SELECT 1'));
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
        await pool.execute.query(rawSql('SELECT 1'));
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
});
