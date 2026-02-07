import assert from 'assert';
import { describe, it } from 'node:test';
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

void describe('mapPostgresError', () => {
  void describe('returns DumboError(500) for non-PostgreSQL errors', () => {
    void it('returns DumboError(500) for a plain Error without code', () => {
      const result = mapPostgresError(new Error('plain error'));
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.errorCode, 500);
    });

    void it('returns DumboError(500) for a non-Error value', () => {
      for (const value of ['string', 42, null, undefined]) {
        const result = mapPostgresError(value);
        assert.ok(result instanceof DumboError);
        assert.strictEqual(result.errorCode, 500);
      }
    });

    void it('returns DumboError(500) for an error with numeric code', () => {
      const error = new Error('numeric code');
      (error as Error & { code: number }).code = 123;
      const result = mapPostgresError(error);
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.errorCode, 500);
    });
  });

  void describe('integrity constraint violations (class 23)', () => {
    void it('maps 23505 to UniqueConstraintError', () => {
      const result = mapPostgresError(pgError('23505'));
      assert.ok(result instanceof UniqueConstraintError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.innerError?.message, 'test error');
    });

    void it('maps 23503 to ForeignKeyViolationError', () => {
      const result = mapPostgresError(pgError('23503'));
      assert.ok(result instanceof ForeignKeyViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
    });

    void it('maps 23502 to NotNullViolationError', () => {
      const result = mapPostgresError(pgError('23502'));
      assert.ok(result instanceof NotNullViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
    });

    void it('maps 23514 to CheckViolationError', () => {
      const result = mapPostgresError(pgError('23514'));
      assert.ok(result instanceof CheckViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
    });

    void it('maps 23P01 to ExclusionViolationError', () => {
      const result = mapPostgresError(pgError('23P01'));
      assert.ok(result instanceof ExclusionViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
    });

    void it('maps unknown class 23 code to IntegrityConstraintViolationError', () => {
      const result = mapPostgresError(pgError('23000'));
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(result instanceof DumboError);
    });
  });

  void describe('transaction rollback (class 40)', () => {
    void it('maps 40001 to SerializationError', () => {
      const result = mapPostgresError(pgError('40001'));
      assert.ok(result instanceof SerializationError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 40P01 to DeadlockError', () => {
      const result = mapPostgresError(pgError('40P01'));
      assert.ok(result instanceof DeadlockError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('lock errors (class 55)', () => {
    void it('maps 55P03 to LockNotAvailableError', () => {
      const result = mapPostgresError(pgError('55P03'));
      assert.ok(result instanceof LockNotAvailableError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 55006 to LockNotAvailableError', () => {
      const result = mapPostgresError(pgError('55006'));
      assert.ok(result instanceof LockNotAvailableError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('connection errors (class 08)', () => {
    void it('maps 08000 to ConnectionError', () => {
      const result = mapPostgresError(pgError('08000'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 08003 to ConnectionError', () => {
      const result = mapPostgresError(pgError('08003'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 08006 to ConnectionError', () => {
      const result = mapPostgresError(pgError('08006'));
      assert.ok(result instanceof ConnectionError);
    });
  });

  void describe('operator intervention (class 57)', () => {
    void it('maps 57P01 (admin shutdown) to AdminShutdownError', () => {
      const result = mapPostgresError(pgError('57P01'));
      assert.ok(result instanceof AdminShutdownError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 57P02 (crash shutdown) to AdminShutdownError', () => {
      const result = mapPostgresError(pgError('57P02'));
      assert.ok(result instanceof AdminShutdownError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 57P03 (cannot connect now) to ConnectionError', () => {
      const result = mapPostgresError(pgError('57P03'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 57P05 (idle session timeout) to ConnectionError', () => {
      const result = mapPostgresError(pgError('57P05'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 57014 (query canceled) to QueryCanceledError', () => {
      const result = mapPostgresError(pgError('57014'));
      assert.ok(result instanceof QueryCanceledError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps unknown class 57 code to ConnectionError', () => {
      const result = mapPostgresError(pgError('57999'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('insufficient resources (class 53)', () => {
    void it('maps 53000 to InsufficientResourcesError', () => {
      const result = mapPostgresError(pgError('53000'));
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 53300 (too many connections) to InsufficientResourcesError', () => {
      const result = mapPostgresError(pgError('53300'));
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('system errors (class 58)', () => {
    void it('maps 58000 to SystemError', () => {
      const result = mapPostgresError(pgError('58000'));
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps 58030 (I/O error) to SystemError', () => {
      const result = mapPostgresError(pgError('58030'));
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('data exceptions (class 22)', () => {
    void it('maps 22000 to DataError', () => {
      const result = mapPostgresError(pgError('22000'));
      assert.ok(result instanceof DataError);
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.errorCode, 400);
    });

    void it('maps 22012 (division by zero) to DataError', () => {
      const result = mapPostgresError(pgError('22012'));
      assert.ok(result instanceof DataError);
    });
  });

  void describe('syntax/access errors (class 42)', () => {
    void it('maps 42601 (syntax error) to InvalidOperationError', () => {
      const result = mapPostgresError(pgError('42601'));
      assert.ok(result instanceof InvalidOperationError);
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.errorCode, 400);
    });

    void it('maps 42P01 (undefined table) to InvalidOperationError', () => {
      const result = mapPostgresError(pgError('42P01'));
      assert.ok(result instanceof InvalidOperationError);
    });
  });

  void describe('preserves inner error', () => {
    void it('sets innerError to original error', () => {
      const original = pgError('23505', 'duplicate key value');
      const result = mapPostgresError(original);
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.innerError, original);
      assert.strictEqual(result.cause, original);
    });

    void it('preserves original error message', () => {
      const result = mapPostgresError(pgError('23505', 'duplicate key value'));
      assert.ok(result);
      assert.strictEqual(result.message, 'duplicate key value');
    });
  });

  void describe('returns DumboError(500) for unrecognized SQLSTATE classes', () => {
    void it('returns DumboError(500) for class 01 (warning)', () => {
      const result = mapPostgresError(pgError('01000'));
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.errorCode, 500);
    });

    void it('returns DumboError(500) for class P0 (PL/pgSQL)', () => {
      const result = mapPostgresError(pgError('P0001'));
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.errorCode, 500);
    });
  });
});
