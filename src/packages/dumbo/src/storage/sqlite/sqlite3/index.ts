export * from './connections';
import type { Dumbo } from '../../../core';
import {
  sqlitePool,
  type SQLiteConnection,
  type SQLitePoolOptions,
} from '../core';
import {
  sqlite3Client as sqliteClient,
  type SQLite3Connector,
} from './connections';

export { sqliteClient };

export const connectionPool = sqlitePool;

export const dumbo = <
  DumboOptionsType extends
    SQLitePoolOptions<SQLite3Connector> = SQLitePoolOptions<SQLite3Connector>,
>(
  options: DumboOptionsType,
): Dumbo<SQLite3Connector, SQLiteConnection<SQLite3Connector>> =>
  sqlitePool(options);
