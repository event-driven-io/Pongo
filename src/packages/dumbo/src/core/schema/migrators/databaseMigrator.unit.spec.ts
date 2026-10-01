import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { dumbo } from '../../..';
import { InMemorySQLiteDatabase } from '../../../storage/sqlite/core';
import { SQLite3DriverType } from '../../../storage/sqlite/sqlite3';
import { SQL } from '../../sql';
import { schemaComponent } from '../schemaComponent';
import { sqlMigration } from '../sqlMigration';
import { databaseMigrator } from './databaseMigrator';

describe('database migration description', () => {
  it('retains its component and describes only component SQL', () => {
    const component = schemaComponent('test', {
      migrations: () => [
        sqlMigration('test:create', [SQL`CREATE TABLE example (id INTEGER)`]),
      ],
    });
    const pool = dumbo({
      connectionString: InMemorySQLiteDatabase,
      driverType: SQLite3DriverType,
    });

    const migrator = databaseMigrator({ component, pool });

    assert.equal(migrator.component, component);
    assert.match(migrator.sql(), /CREATE TABLE example/);
    assert.doesNotMatch(migrator.sql(), /dmb_migrations/);
    assert.ok(Object.isFrozen(migrator));
  });
});
