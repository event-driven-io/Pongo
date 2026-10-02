import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { dumbo } from '../../..';
import { InMemorySQLiteDatabase } from '../../../storage/sqlite/core';
import { SQLite3DriverType } from '../../../storage/sqlite/sqlite3';
import { SQL } from '../../sql';
import { schemaComponent } from '../schemaComponent';
import { sqlMigration } from '../sqlMigration';
import { schemaComponentMigrator } from './schemaComponentMigrator';

describe('schema component migrator', () => {
  it('describes the SQL of its component without the migration table', () => {
    const component = schemaComponent('users', {
      migrations: () => [
        sqlMigration('users:create', [SQL`CREATE TABLE users (id INTEGER)`]),
      ],
    });
    const pool = dumbo({
      connectionString: InMemorySQLiteDatabase,
      driverType: SQLite3DriverType,
    });

    const sql = schemaComponentMigrator({ component, pool }).sql();

    assert.match(sql, /CREATE TABLE users/);
    assert.doesNotMatch(sql, /dmb_migrations/);
  });
});
