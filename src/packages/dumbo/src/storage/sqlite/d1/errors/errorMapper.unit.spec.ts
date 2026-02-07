import assert from 'assert';
import { describe, it } from 'node:test';
import {
  CheckViolationError,
  ConnectionError,
  DataError,
  DeadlockError,
  DumboError,
  ForeignKeyViolationError,
  InsufficientResourcesError,
  IntegrityConstraintViolationError,
  InvalidOperationError,
  LockNotAvailableError,
  NotNullViolationError,
  SerializationError,
  SystemError,
  TransientDatabaseError,
  UniqueConstraintError,
} from '../../../../core/errors';
import { mapD1Error } from './errorMapper';

/**
 * Creates a plain Error matching the shape thrown by Cloudflare D1 (workerd).
 * D1 errors have **no `code` property** — all information is in the message.
 */
const d1Error = (message: string): Error => new Error(message);

void describe('mapD1Error', () => {
  void describe('returns DumboError(500) for non-D1 errors', () => {
    void it('returns DumboError(500) for a plain Error without D1 content', () => {
      const result = mapD1Error(new Error('plain error'));
      assert.ok(result instanceof DumboError);
      assert.ok(DumboError.isInstanceOf(result));
      assert.strictEqual(result.errorCode, 500);
    });

    void it('returns DumboError(500) for a non-Error value', () => {
      for (const value of ['string', 42, null, undefined]) {
        const result = mapD1Error(value);
        assert.ok(result instanceof DumboError);
        assert.ok(DumboError.isInstanceOf(result));
        assert.strictEqual(result.errorCode, 500);
      }
    });

    void it('returns DumboError(500) for an error with unrelated message', () => {
      const result = mapD1Error(
        new Error('Something completely unrelated happened'),
      );
      assert.ok(result instanceof DumboError);
      assert.ok(DumboError.isInstanceOf(result));
      assert.strictEqual(result.errorCode, 500);
    });
  });

  void describe('constraint violations (D1_ERROR with constraint text)', () => {
    void it('maps UNIQUE constraint to UniqueConstraintError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: UNIQUE constraint failed: users.email'),
      );
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
    });

    void it('maps PRIMARY KEY constraint to UniqueConstraintError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: PRIMARY KEY must be unique'),
      );
      assert.ok(result instanceof UniqueConstraintError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: UniqueConstraintError.ErrorType,
        }),
      );
    });

    void it('maps FOREIGN KEY constraint to ForeignKeyViolationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: FOREIGN KEY constraint failed'),
      );
      assert.ok(result instanceof ForeignKeyViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: ForeignKeyViolationError.ErrorType,
        }),
      );
    });

    void it('maps NOT NULL constraint to NotNullViolationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: NOT NULL constraint failed: users.name'),
      );
      assert.ok(result instanceof NotNullViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: NotNullViolationError.ErrorType,
        }),
      );
    });

    void it('maps CHECK constraint to CheckViolationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: CHECK constraint failed: age_positive'),
      );
      assert.ok(result instanceof CheckViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: CheckViolationError.ErrorType,
        }),
      );
    });

    void it('maps generic constraint to IntegrityConstraintViolationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_CONSTRAINT: constraint failed'),
      );
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(result instanceof DumboError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: IntegrityConstraintViolationError.ErrorType,
        }),
      );
    });

    void it('maps constraint with SQLITE_CONSTRAINT prefix in message', () => {
      const result = mapD1Error(
        d1Error(
          'D1_ERROR: SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email',
        ),
      );
      assert.ok(result instanceof UniqueConstraintError);
    });
  });

  void describe('D1-specific prefix errors', () => {
    void it('maps D1_TYPE_ERROR to DataError', () => {
      const result = mapD1Error(
        d1Error(
          'D1_TYPE_ERROR: Provided value is undefined but should be null. Use null, not undefined.',
        ),
      );
      assert.ok(result instanceof DataError);
      assert.ok(result instanceof DumboError);
      assert.ok(
        DumboError.isInstanceOf(result, { errorType: DataError.ErrorType }),
      );
      assert.strictEqual(result.errorCode, 400);
    });

    void it('maps D1_COLUMN_NOTFOUND to DataError', () => {
      const result = mapD1Error(d1Error('D1_COLUMN_NOTFOUND'));
      assert.ok(result instanceof DataError);
      assert.strictEqual(result.errorCode, 400);
    });

    void it('maps D1_DUMP_ERROR to SystemError', () => {
      const result = mapD1Error(
        d1Error('D1_DUMP_ERROR: failed to dump database'),
      );
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: SystemError.ErrorType,
        }),
      );
    });

    void it('maps D1_SESSION_ERROR to ConnectionError', () => {
      const result = mapD1Error(
        d1Error('D1_SESSION_ERROR: invalid bookmark or constraint'),
      );
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: ConnectionError.ErrorType,
        }),
      );
    });

    void it('maps D1_EXEC_ERROR to InvalidOperationError', () => {
      const result = mapD1Error(
        d1Error('D1_EXEC_ERROR: Error in line 3: no such table: foo'),
      );
      assert.ok(result instanceof InvalidOperationError);
      assert.ok(result instanceof DumboError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: InvalidOperationError.ErrorType,
        }),
      );
      assert.strictEqual(result.errorCode, 400);
    });
  });

  void describe('D1 platform transient errors', () => {
    void it('maps "Network connection lost." to ConnectionError', () => {
      const result = mapD1Error(d1Error('Network connection lost.'));
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: ConnectionError.ErrorType,
        }),
      );
    });

    void it('maps transient resolve error to ConnectionError', () => {
      const result = mapD1Error(
        d1Error('Cannot resolve D1 DB due to transient issue on remote node.'),
      );
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps D1 DB reset to ConnectionError', () => {
      const result = mapD1Error(
        d1Error('D1 DB reset because its code was updated.'),
      );
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps overloaded DB to InsufficientResourcesError', () => {
      const result = mapD1Error(
        d1Error('D1 DB is overloaded. Too many requests queued.'),
      );
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: InsufficientResourcesError.ErrorType,
        }),
      );
    });

    void it('maps too many requests to InsufficientResourcesError', () => {
      const result = mapD1Error(
        d1Error('Too many requests. Please retry later.'),
      );
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps memory limit to InsufficientResourcesError', () => {
      const result = mapD1Error(
        d1Error('Memory limit would be exceeded by this operation.'),
      );
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('D1_ERROR with embedded SQLITE_* codes', () => {
    void it('maps D1_ERROR + SQLITE_BUSY to LockNotAvailableError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_BUSY: database is locked'),
      );
      assert.ok(result instanceof LockNotAvailableError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: LockNotAvailableError.ErrorType,
        }),
      );
    });

    void it('maps D1_ERROR + SQLITE_LOCKED to DeadlockError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_LOCKED: database table is locked'),
      );
      assert.ok(result instanceof DeadlockError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: DeadlockError.ErrorType,
        }),
      );
    });

    void it('maps D1_ERROR + SQLITE_CANTOPEN to ConnectionError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_CANTOPEN: unable to open database file'),
      );
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: ConnectionError.ErrorType,
        }),
      );
    });

    void it('maps D1_ERROR + SQLITE_NOMEM to InsufficientResourcesError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_NOMEM: out of memory'),
      );
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: InsufficientResourcesError.ErrorType,
        }),
      );
    });

    void it('maps D1_ERROR + SQLITE_IOERR to SystemError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_IOERR: disk I/O error'),
      );
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: SystemError.ErrorType,
        }),
      );
    });

    void it('maps D1_ERROR + SQLITE_CORRUPT to SystemError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_CORRUPT: database disk image is malformed'),
      );
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps D1_ERROR + SQLITE_TOOBIG to DataError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_TOOBIG: string or blob too big'),
      );
      assert.ok(result instanceof DataError);
      assert.ok(
        DumboError.isInstanceOf(result, { errorType: DataError.ErrorType }),
      );
      assert.strictEqual(result.errorCode, 400);
    });

    void it('maps D1_ERROR + SQLITE_MISMATCH to DataError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_MISMATCH: datatype mismatch'),
      );
      assert.ok(result instanceof DataError);
    });

    void it('maps D1_ERROR + SQLITE_RANGE to DataError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_RANGE: column index out of range'),
      );
      assert.ok(result instanceof DataError);
    });

    void it('maps D1_ERROR + SQLITE_ERROR to InvalidOperationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_ERROR: no such table: foo'),
      );
      assert.ok(result instanceof InvalidOperationError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: InvalidOperationError.ErrorType,
        }),
      );
      assert.strictEqual(result.errorCode, 400);
    });

    void it('maps D1_ERROR + SQLITE_READONLY to InvalidOperationError', () => {
      const result = mapD1Error(
        d1Error(
          'D1_ERROR: SQLITE_READONLY: attempt to write a readonly database',
        ),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps D1_ERROR + SQLITE_AUTH to InvalidOperationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_AUTH: authorization denied'),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps D1_ERROR + SQLITE_PERM to InvalidOperationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_PERM: access permission denied'),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps D1_ERROR + SQLITE_SCHEMA to InvalidOperationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_SCHEMA: database schema has changed'),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps D1_ERROR + SQLITE_ABORT to SerializationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_ABORT: callback requested query abort'),
      );
      assert.ok(result instanceof SerializationError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: SerializationError.ErrorType,
        }),
      );
    });

    void it('maps D1_ERROR + SQLITE_INTERRUPT to SerializationError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_INTERRUPT: interrupted'),
      );
      assert.ok(result instanceof SerializationError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps D1_ERROR + SQLITE_FULL to InsufficientResourcesError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_FULL: database or disk is full'),
      );
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps D1_ERROR + SQLITE_PROTOCOL to LockNotAvailableError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_PROTOCOL: locking protocol'),
      );
      assert.ok(result instanceof LockNotAvailableError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps D1_ERROR + SQLITE_NOTADB to ConnectionError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_NOTADB: file is not a database'),
      );
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps D1_ERROR + SQLITE_INTERNAL to SystemError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_INTERNAL: internal error'),
      );
      assert.ok(result instanceof SystemError);
    });

    void it('maps D1_ERROR + SQLITE_NOLFS to SystemError', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_NOLFS: large file support is disabled'),
      );
      assert.ok(result instanceof SystemError);
    });

    void it('maps D1_ERROR + SQLITE_MISUSE to InvalidOperationError', () => {
      const result = mapD1Error(
        d1Error(
          'D1_ERROR: SQLITE_MISUSE: library routine called out of sequence',
        ),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('falls back to InvalidOperationError for D1_ERROR with unknown SQLITE code', () => {
      const result = mapD1Error(
        d1Error('D1_ERROR: SQLITE_NOTICE: some notice'),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('falls back to InvalidOperationError for D1_ERROR without SQLITE code', () => {
      const result = mapD1Error(d1Error('D1_ERROR: something went wrong'));
      assert.ok(result instanceof InvalidOperationError);
    });
  });

  void describe('D1_EXEC_ERROR with embedded SQLITE_* codes', () => {
    void it('maps D1_EXEC_ERROR + SQLITE_ERROR to InvalidOperationError', () => {
      const result = mapD1Error(
        d1Error(
          'D1_EXEC_ERROR: Error in line 5: SQLITE_ERROR: no such table: foo',
        ),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps D1_EXEC_ERROR without SQLITE code to InvalidOperationError', () => {
      const result = mapD1Error(
        d1Error('D1_EXEC_ERROR: Error in line 2: syntax error'),
      );
      assert.ok(result instanceof InvalidOperationError);
    });
  });

  void describe('bare SQLITE_* codes in message (no D1 prefix)', () => {
    void it('maps SQLITE_BUSY in bare message to LockNotAvailableError', () => {
      const result = mapD1Error(d1Error('SQLITE_BUSY: database is locked'));
      assert.ok(result instanceof LockNotAvailableError);
      assert.ok(result instanceof TransientDatabaseError);
      assert.ok(
        DumboError.isInstanceOf(result, {
          errorType: LockNotAvailableError.ErrorType,
        }),
      );
    });

    void it('maps SQLITE_ERROR in bare message to InvalidOperationError', () => {
      const result = mapD1Error(d1Error('SQLITE_ERROR: no such table: foo'));
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps SQLITE_CORRUPT in bare message to SystemError', () => {
      const result = mapD1Error(
        d1Error('SQLITE_CORRUPT: database disk image is malformed'),
      );
      assert.ok(result instanceof SystemError);
    });
  });

  void describe('preserves inner error', () => {
    void it('sets innerError to original error', () => {
      const original = d1Error('D1_ERROR: UNIQUE constraint failed: users.id');
      const result = mapD1Error(original);
      assert.ok(result instanceof DumboError);
      assert.ok(DumboError.isInstanceOf(result));
      assert.strictEqual(result.innerError, original);
      assert.strictEqual(result.cause, original);
    });

    void it('preserves original error message', () => {
      const msg = 'D1_ERROR: UNIQUE constraint failed: users.id';
      const result = mapD1Error(d1Error(msg));
      assert.ok(result);
      assert.strictEqual(result.message, msg);
    });
  });
});
