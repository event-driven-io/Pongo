import assert from 'node:assert';
import { describe, it } from 'vitest';
import { assertThrowsDumboError } from '../../../../core/errors/errorAssertions';
import { PostgreSQLConnectionString } from './connectionString';

describe('creating a PostgreSQL connection string', () => {
  it('accepts postgresql and postgres schemes', () => {
    assert.strictEqual(
      PostgreSQLConnectionString('postgresql://postgres@localhost:5432/dumbo'),
      'postgresql://postgres@localhost:5432/dumbo',
    );
    assert.strictEqual(
      PostgreSQLConnectionString('postgres://postgres@localhost:5432/dumbo'),
      'postgres://postgres@localhost:5432/dumbo',
    );
  });

  it('throws an InvalidOperationError for a non-PostgreSQL connection string', () => {
    assertThrowsDumboError(
      () => PostgreSQLConnectionString('mysql://localhost:3306/dumbo'),
      {
        errorType: 'InvalidOperationError',
        errorCode: 400,
        message:
          'Invalid PostgreSQL connection string: mysql://localhost:3306/dumbo. It should start with "postgresql://".',
      },
    );
  });
});
