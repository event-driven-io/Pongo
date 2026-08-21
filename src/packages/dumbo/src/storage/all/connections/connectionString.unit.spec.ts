import assert from 'node:assert';
import { describe, it } from 'vitest';
import { assertThrowsDumboError } from '../../../core/errors/errorAssertions';
import { parseConnectionString } from './connectionString';

describe('parsing a database connection string', () => {
  it('resolves the driver parts for supported connection strings', () => {
    assert.deepStrictEqual(
      parseConnectionString('postgresql://postgres@localhost:5432/postgres'),
      { databaseType: 'PostgreSQL', driverName: 'pg' },
    );
    assert.deepStrictEqual(parseConnectionString(':memory:'), {
      databaseType: 'SQLite',
      driverName: 'sqlite3',
    });
    assert.deepStrictEqual(parseConnectionString('d1://my-database'), {
      databaseType: 'SQLite',
      driverName: 'd1',
    });
  });

  it('throws an InvalidOperationError for an unsupported connection string', () => {
    assertThrowsDumboError(
      () => parseConnectionString('mysql://localhost:3306/dumbo'),
      {
        errorType: 'InvalidOperationError',
        errorCode: 400,
        message:
          'Unsupported database connection string: mysql://localhost:3306/dumbo',
      },
    );
  });
});
