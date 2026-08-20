import type {
  SQLite3Connection,
  SQLiteConnectionString,
} from '@event-driven-io/dumbo/sqlite3';
import { describe, expectTypeOf, it } from 'vitest';
import type { ExtractPongoDriverOptions } from '../../../core';
import type { sqlite3Driver } from './index';

type SQLite3PongoDriverOptions = ExtractPongoDriverOptions<
  typeof sqlite3Driver
>;

describe('typing the SQLite3 Pongo driver options', () => {
  it('requires a connection string for driver-created connections', () => {
    expectTypeOf<{
      connectionString: string | SQLiteConnectionString;
    }>().toExtend<SQLite3PongoDriverOptions>();
  });

  it('allows an ambient connection without another connection string', () => {
    expectTypeOf<{
      connectionOptions: { connection: SQLite3Connection };
      connectionString: string | SQLiteConnectionString;
    }>().toExtend<SQLite3PongoDriverOptions>();
  });
});
