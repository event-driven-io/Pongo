import assert from 'assert';
import { describe, it } from 'vitest';
import {
  AdminShutdownError,
  CheckViolationError,
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
} from '../../../../core/errors';
import { mapPostgresError } from './errorMapper';

const pgError = (code: string, message = 'test error'): Error => {
  const error = new Error(message);
  (error as Error & { code: string }).code = code;
  return error;
};

describe('mapPostgresError', () => {
  describe('returns DumboError(500) for non-PostgreSQL errors', () => {
    it('returns DumboError(500) for a plain Error without code', () => {
      const result = mapPostgresError(new Error('plain error'));
      assert.ok(result instanceof DumboError);
      assert.ok(DumboError.isInstanceOf(result));
      assert.strictEqual(result.errorCode, 500);
    });

    it('returns DumboError(500) for a non-Error value', () => {
      for (const value of ['string', 42, null, undefined]) {
        const result = mapPostgresError(value);
        assert.ok(result instanceof DumboError);
        assert.ok(DumboError.isInstanceOf(result));
        assert.strictEqual(result.errorCode, 500);
      }
    });

    it('returns DumboError(500) for an error with numeric code', () => {
      const error = new Error('numeric code');
      (error as Error & { code: number }).code = 123;
      const result = mapPostgresError(error);
      assert.ok(result instanceof DumboError);
      assert.ok(DumboError.isInstanceOf(result));
      assert.strictEqual(result.errorCode, 500);
    });
  });

  describe('integrity constraint violations (class 23)', () => {
    it('maps 23505 to UniqueConstraintError', () => {
      const result = mapPostgresError(pgError('23505'));
      assert.ok(result instanceof UniqueConstraintError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(result instanceof DumboError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: UniqueConstraintError.ErrorType,
        }),
      );
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorCode: IntegrityConstraintViolationError.ErrorCode,
        }),
      );
      assert.strictEqual(result.innerError?.message, 'test error');
    });

    it('maps 23503 to ForeignKeyViolationError', () => {
      const result = mapPostgresError(pgError('23503'));
      assert.ok(result instanceof ForeignKeyViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: ForeignKeyViolationError.ErrorType,
        }),
      );
    });

    it('maps 23502 to NotNullViolationError', () => {
      const result = mapPostgresError(pgError('23502'));
      assert.ok(result instanceof NotNullViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: NotNullViolationError.ErrorType,
        }),
      );
    });

    it('maps 23514 to CheckViolationError', () => {
      const result = mapPostgresError(pgError('23514'));
      assert.ok(result instanceof CheckViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: CheckViolationError.ErrorType,
        }),
      );
    });

    it('maps 23P01 to ExclusionViolationError', () => {
      const result = mapPostgresError(pgError('23P01'));
      assert.ok(result instanceof ExclusionViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: ExclusionViolationError.ErrorType,
        }),
      );
    });

    it('maps unknown class 23 code to IntegrityConstraintViolationError', () => {
      const result = mapPostgresError(pgError('23000'));
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(result instanceof DumboError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: IntegrityConstraintViolationError.ErrorType,
        }),
      );
    });
  });

  describe('transaction rollback (class 40)', () => {
    it('maps 40001 to SerializationError', () => {
      const result = mapPostgresError(pgError('40001'));
      assert.ok(result instanceof SerializationError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: SerializationError.ErrorType,
        }),
      );
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorCode: TransientDatabaseError.ErrorCode,
        }),
      );
    });

    it('maps 40P01 to DeadlockError', () => {
      const result = mapPostgresError(pgError('40P01'));
      assert.ok(result instanceof DeadlockError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: DeadlockError.ErrorType,
        }),
      );
    });
  });

  describe('lock errors (class 55)', () => {
    it('maps 55P03 to LockNotAvailableError', () => {
      const result = mapPostgresError(pgError('55P03'));
      assert.ok(result instanceof LockNotAvailableError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: LockNotAvailableError.ErrorType,
        }),
      );
    });

    it('maps 55006 to LockNotAvailableError', () => {
      const result = mapPostgresError(pgError('55006'));
      assert.ok(result instanceof LockNotAvailableError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  describe('connection errors (class 08)', () => {
    it('maps 08000 to ConnectionError', () => {
      const result = mapPostgresError(pgError('08000'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: ConnectionError.ErrorType,
        }),
      );
    });

    it('maps 08003 to ConnectionError', () => {
      const result = mapPostgresError(pgError('08003'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    it('maps 08006 to ConnectionError', () => {
      const result = mapPostgresError(pgError('08006'));
      assert.ok(result instanceof ConnectionError);
    });
  });

  describe('operator intervention (class 57)', () => {
    it('maps 57P01 (admin shutdown) to AdminShutdownError', () => {
      const result = mapPostgresError(pgError('57P01'));
      assert.ok(result instanceof AdminShutdownError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: AdminShutdownError.ErrorType,
        }),
      );
    });

    it('maps 57P02 (crash shutdown) to AdminShutdownError', () => {
      const result = mapPostgresError(pgError('57P02'));
      assert.ok(result instanceof AdminShutdownError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    it('maps 57P03 (cannot connect now) to ConnectionError', () => {
      const result = mapPostgresError(pgError('57P03'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    it('maps 57P05 (idle session timeout) to ConnectionError', () => {
      const result = mapPostgresError(pgError('57P05'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    it('maps 57014 (query canceled) to QueryCanceledError', () => {
      const result = mapPostgresError(pgError('57014'));
      assert.ok(result instanceof QueryCanceledError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: QueryCanceledError.ErrorType,
        }),
      );
    });

    it('maps unknown class 57 code to ConnectionError', () => {
      const result = mapPostgresError(pgError('57999'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  describe('insufficient resources (class 53)', () => {
    it('maps 53000 to InsufficientResourcesError', () => {
      const result = mapPostgresError(pgError('53000'));
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: InsufficientResourcesError.ErrorType,
        }),
      );
    });

    it('maps 53300 (too many connections) to InsufficientResourcesError', () => {
      const result = mapPostgresError(pgError('53300'));
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  describe('system errors (class 58)', () => {
    it('maps 58000 to SystemError', () => {
      const result = mapPostgresError(pgError('58000'));
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: SystemError.ErrorType,
        }),
      );
    });

    it('maps 58030 (I/O error) to SystemError', () => {
      const result = mapPostgresError(pgError('58030'));
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  describe('data exceptions (class 22)', () => {
    it('maps 22000 to DataError', () => {
      const result = mapPostgresError(pgError('22000'));
      assert.ok(result instanceof DataError);
      assert.ok(result instanceof DumboError);
      assert.ok(
        DumboError.isInstanceOf(result, { errorType: DataError.ErrorType }),
      );
      assert.strictEqual(result.errorCode, 400);
    });

    it('maps 22012 (division by zero) to DataError', () => {
      const result = mapPostgresError(pgError('22012'));
      assert.ok(result instanceof DataError);
    });
  });

  describe('syntax/access errors (class 42)', () => {
    it('maps 42601 (syntax error) to InvalidOperationError', () => {
      const result = mapPostgresError(pgError('42601'));
      assert.ok(result instanceof InvalidOperationError);
      assert.ok(result instanceof DumboError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: InvalidOperationError.ErrorType,
        }),
      );
      assert.strictEqual(result.errorCode, 400);
    });

    it('maps 42P01 (undefined table) to InvalidOperationError', () => {
      const result = mapPostgresError(pgError('42P01'));
      assert.ok(result instanceof InvalidOperationError);
    });
  });

  describe('preserves inner error', () => {
    it('sets innerError to original error', () => {
      const original = pgError('23505', 'duplicate key value');
      const result = mapPostgresError(original);
      assert.ok(result instanceof DumboError);
      assert.ok(DumboError.isInstanceOf(result));
      assert.strictEqual(result.innerError, original);
      assert.strictEqual(result.cause, original);
    });

    it('preserves original error message', () => {
      const result = mapPostgresError(pgError('23505', 'duplicate key value'));
      assert.ok(result);
      assert.strictEqual(result.message, 'duplicate key value');
    });
  });

  describe('returns DumboError(500) for unrecognized SQLSTATE classes', () => {
    it('returns DumboError(500) for class 01 (warning)', () => {
      const result = mapPostgresError(pgError('01000'));
      assert.ok(result instanceof DumboError);
      assert.ok(DumboError.isInstanceOf(result));
      assert.strictEqual(result.errorCode, 500);
    });

    it('returns DumboError(500) for class P0 (PL/pgSQL)', () => {
      const result = mapPostgresError(pgError('P0001'));
      assert.ok(result instanceof DumboError);
      assert.ok(DumboError.isInstanceOf(result));
      assert.strictEqual(result.errorCode, 500);
    });
  });

  describe('DumboError passthrough', () => {
    it('returns the same DumboError if error is already a DumboError', () => {
      const original = new UniqueConstraintError('already mapped');
      const result = mapPostgresError(original);
      assert.strictEqual(result, original);
    });

    it('returns the same IntegrityConstraintViolationError', () => {
      const original = new IntegrityConstraintViolationError('already mapped');
      const result = mapPostgresError(original);
      assert.strictEqual(result, original);
    });

    it('returns the same generic DumboError', () => {
      const original = new DumboError({
        errorCode: 500,
        message: 'already mapped',
      });
      const result = mapPostgresError(original);
      assert.strictEqual(result, original);
    });
  });
});
