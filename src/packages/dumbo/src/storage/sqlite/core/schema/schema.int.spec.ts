import { afterEach, beforeEach, describe } from 'vitest';
import { InMemorySQLiteDatabase } from '..';
import { dumbo, type Dumbo } from '../../../..';
import { SQLite3DriverType } from '../../../../sqlite3';
import { sqliteSchemaObjectsTests } from '../../sqliteSchemaObjectsTests';

describe('checking if SQLite schema objects exist', () => {
  let pool: Dumbo;

  beforeEach(() => {
    pool = dumbo({
      connectionString: InMemorySQLiteDatabase,
      driverType: SQLite3DriverType,
    });
  });

  afterEach(() => pool.close());

  sqliteSchemaObjectsTests({ execute: () => pool.execute });
});
