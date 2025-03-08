import sqlite3 from 'sqlite3';
import type { SQLiteConnectorType } from '../../core';
import {
  InMemorySQLiteDatabase,
  type Parameters,
  type SQLiteClient,
  type SQLiteClientOptions,
} from '../../core/connections';

export type SQLite3Connector = SQLiteConnectorType<'sqlite3'>;
export const SQLite3ConnectorType: SQLite3Connector = 'SQLite:sqlite3';

export type ConnectionCheckResult =
  | { successful: true }
  | {
      successful: false;
      code: string | undefined;
      errorType: 'ConnectionRefused' | 'Authentication' | 'Unknown';
      error: unknown;
    };

export const sqlite3Client = (options: SQLiteClientOptions): SQLiteClient => {
  const db = new sqlite3.Database(options.fileName ?? InMemorySQLiteDatabase);

  return {
    close: (): Promise<void> => {
      db.close();
      return Promise.resolve();
    },
    command: (sql: string, params?: Parameters[]) =>
      new Promise((resolve, reject) => {
        db.run(sql, params ?? [], (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }

          resolve();
        });
      }),
    query: <T>(sql: string, params?: Parameters[]): Promise<T[]> =>
      new Promise((resolve, reject) => {
        db.all(sql, params ?? [], (err: Error | null, result: T[]) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(result);
        });
      }),
    querySingle: <T>(sql: string, params?: Parameters[]): Promise<T | null> =>
      new Promise((resolve, reject) => {
        db.get(sql, params ?? [], (err: Error | null, result: T | null) => {
          if (err) {
            reject(err);
            return;
          }

          resolve(result);
        });
      }),
  };
};

export const checkConnection = async (
  fileName: string,
): Promise<ConnectionCheckResult> => {
  const client = sqlite3Client({
    fileName,
  });

  try {
    await client.querySingle('SELECT 1');
    return { successful: true };
  } catch (error) {
    const code =
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : undefined;

    return {
      successful: false,
      errorType:
        code === 'SQLITE_CANTOPEN'
          ? 'ConnectionRefused'
          : code === 'SQLITE_AUTH'
            ? 'Authentication'
            : 'Unknown',
      code,
      error,
    };
  } finally {
    await client.close();
  }
};
