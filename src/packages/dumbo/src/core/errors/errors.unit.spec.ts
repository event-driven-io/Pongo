import assert from 'assert';
import { describe, it } from 'vitest';
import { BatchCommandNoChangesError } from '../execute';
import {
  AdminShutdownError,
  CheckViolationError,
  ConcurrencyError,
  ConnectionError,
  DataError,
  DeadlockError,
  DumboError,
  ExclusionViolationError,
  ForeignKeyViolationError,
  InsufficientResourcesError,
  IntegrityConstraintViolationError,
  InvalidOperationError,
  LockNotAvailableError,
  NotNullViolationError,
  QueryCanceledError,
  SerializationError,
  SystemError,
  TransientDatabaseError,
  UniqueConstraintError,
} from './index';

const errorCases: {
  errorType: string;
  errorCode: number;
  create: () => DumboError;
}[] = [
  {
    errorType: 'ConcurrencyError',
    errorCode: 412,
    create: () => new ConcurrencyError(),
  },
  {
    errorType: 'TransientDatabaseError',
    errorCode: 503,
    create: () => new TransientDatabaseError(),
  },
  {
    errorType: 'ConnectionError',
    errorCode: 503,
    create: () => new ConnectionError(),
  },
  {
    errorType: 'SerializationError',
    errorCode: 503,
    create: () => new SerializationError(),
  },
  {
    errorType: 'DeadlockError',
    errorCode: 503,
    create: () => new DeadlockError(),
  },
  {
    errorType: 'LockNotAvailableError',
    errorCode: 503,
    create: () => new LockNotAvailableError(),
  },
  {
    errorType: 'InsufficientResourcesError',
    errorCode: 503,
    create: () => new InsufficientResourcesError(),
  },
  { errorType: 'SystemError', errorCode: 503, create: () => new SystemError() },
  {
    errorType: 'AdminShutdownError',
    errorCode: 503,
    create: () => new AdminShutdownError(),
  },
  {
    errorType: 'QueryCanceledError',
    errorCode: 503,
    create: () => new QueryCanceledError(),
  },
  {
    errorType: 'IntegrityConstraintViolationError',
    errorCode: 409,
    create: () => new IntegrityConstraintViolationError(),
  },
  {
    errorType: 'UniqueConstraintError',
    errorCode: 409,
    create: () => new UniqueConstraintError(),
  },
  {
    errorType: 'ForeignKeyViolationError',
    errorCode: 409,
    create: () => new ForeignKeyViolationError(),
  },
  {
    errorType: 'NotNullViolationError',
    errorCode: 409,
    create: () => new NotNullViolationError(),
  },
  {
    errorType: 'CheckViolationError',
    errorCode: 409,
    create: () => new CheckViolationError(),
  },
  {
    errorType: 'ExclusionViolationError',
    errorCode: 409,
    create: () => new ExclusionViolationError(),
  },
  { errorType: 'DataError', errorCode: 400, create: () => new DataError() },
  {
    errorType: 'InvalidOperationError',
    errorCode: 400,
    create: () => new InvalidOperationError(),
  },
  {
    errorType: 'BatchCommandNoChangesError',
    errorCode: 409,
    create: () => new BatchCommandNoChangesError(0),
  },
];

describe('Database errors', () => {
  for (const { errorType, errorCode, create } of errorCases) {
    describe(errorType, () => {
      it(`is identified by the "${errorType}" error type`, () => {
        assert.strictEqual(create().errorType, errorType);
      });

      it(`responds with the ${errorCode} status code`, () => {
        assert.strictEqual(create().errorCode, errorCode);
      });
    });
  }

  it('never falls back to the generic DumboError type', () => {
    for (const { create } of errorCases)
      assert.notStrictEqual(create().errorType, DumboError.ErrorType);
  });

  it('assigns a unique error type to every error', () => {
    const types = errorCases.map(({ create }) => create().errorType);

    assert.strictEqual(new Set(types).size, types.length);
  });
});
