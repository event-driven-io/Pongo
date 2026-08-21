import assert from 'node:assert';
import { describe, it } from 'vitest';
import { assertThrowsDumboError } from '../../../../core/errors/errorAssertions';
import { SQLiteConnectionString } from './connectionString';

describe('creating a SQLite connection string', () => {
  it('accepts file, in-memory, absolute and relative paths', () => {
    assert.strictEqual(
      SQLiteConnectionString('file:./dumbo.db'),
      'file:./dumbo.db',
    );
    assert.strictEqual(SQLiteConnectionString(':memory:'), ':memory:');
    assert.strictEqual(
      SQLiteConnectionString('/tmp/dumbo.db'),
      '/tmp/dumbo.db',
    );
    assert.strictEqual(SQLiteConnectionString('./dumbo.db'), './dumbo.db');
  });

  it('throws an InvalidOperationError for a non-SQLite connection string', () => {
    assertThrowsDumboError(
      () => SQLiteConnectionString('mysql://localhost:3306/dumbo'),
      {
        errorType: 'InvalidOperationError',
        errorCode: 400,
        message:
          'Invalid SQLite connection string: mysql://localhost:3306/dumbo. It should start with "file:", ":memory:", "/", or "./".',
      },
    );
  });
});
