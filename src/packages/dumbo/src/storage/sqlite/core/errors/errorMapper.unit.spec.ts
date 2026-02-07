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
import { mapSqliteError } from './errorMapper';

/**
 * Creates a fake sqlite3 error with the shape produced by node-sqlite3:
 * - `error.code`    → string like 'SQLITE_CONSTRAINT'
 * - `error.errno`   → numeric SQLite result code
 * - `error.message` → 'CODE: detail'
 */
const sqliteError = (
  code: string,
  errno: number,
  message = `${code}: test error`,
): Error => {
  const error = new Error(message);
  (error as Error & { code: string; errno: number }).code = code;
  (error as Error & { code: string; errno: number }).errno = errno;
  return error;
};

void describe('mapSqliteError', () => {
  void describe('returns undefined for non-SQLite errors', () => {
    void it('returns undefined for a plain Error without code', () => {
      const result = mapSqliteError(new Error('plain error'));
      assert.strictEqual(result, undefined);
    });

    void it('returns undefined for a non-Error value', () => {
      assert.strictEqual(mapSqliteError('string'), undefined);
      assert.strictEqual(mapSqliteError(42), undefined);
      assert.strictEqual(mapSqliteError(null), undefined);
      assert.strictEqual(mapSqliteError(undefined), undefined);
    });

    void it('returns undefined for an error with numeric code', () => {
      const error = new Error('numeric code');
      (error as Error & { code: number }).code = 123;
      assert.strictEqual(mapSqliteError(error), undefined);
    });

    void it('returns undefined for an unrecognized SQLITE code', () => {
      assert.strictEqual(
        mapSqliteError(sqliteError('SQLITE_NOTICE', 27)),
        undefined,
      );
      assert.strictEqual(
        mapSqliteError(sqliteError('SQLITE_WARNING', 28)),
        undefined,
      );
    });
  });

  void describe('constraint violations (SQLITE_CONSTRAINT)', () => {
    void it('maps UNIQUE constraint to UniqueConstraintError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_CONSTRAINT',
          19,
          'SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email',
        ),
      );
      assert.ok(result instanceof UniqueConstraintError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(result instanceof DumboError);
    });

    void it('maps PRIMARY KEY constraint to UniqueConstraintError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_CONSTRAINT',
          19,
          'SQLITE_CONSTRAINT: PRIMARY KEY must be unique',
        ),
      );
      assert.ok(result instanceof UniqueConstraintError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
    });

    void it('maps FOREIGN KEY constraint to ForeignKeyViolationError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_CONSTRAINT',
          19,
          'SQLITE_CONSTRAINT: FOREIGN KEY constraint failed',
        ),
      );
      assert.ok(result instanceof ForeignKeyViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
    });

    void it('maps NOT NULL constraint to NotNullViolationError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_CONSTRAINT',
          19,
          'SQLITE_CONSTRAINT: NOT NULL constraint failed: users.name',
        ),
      );
      assert.ok(result instanceof NotNullViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
    });

    void it('maps CHECK constraint to CheckViolationError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_CONSTRAINT',
          19,
          'SQLITE_CONSTRAINT: CHECK constraint failed: age_positive',
        ),
      );
      assert.ok(result instanceof CheckViolationError);
      assert.ok(result instanceof IntegrityConstraintViolationError);
    });

    void it('maps unknown constraint subtype to IntegrityConstraintViolationError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_CONSTRAINT',
          19,
          'SQLITE_CONSTRAINT: constraint failed',
        ),
      );
      assert.ok(result instanceof IntegrityConstraintViolationError);
      assert.ok(result instanceof DumboError);
    });
  });

  void describe('busy / lock errors', () => {
    void it('maps SQLITE_BUSY to LockNotAvailableError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_BUSY', 5, 'SQLITE_BUSY: database is locked'),
      );
      assert.ok(result instanceof LockNotAvailableError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps SQLITE_LOCKED to DeadlockError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_LOCKED',
          6,
          'SQLITE_LOCKED: database table is locked',
        ),
      );
      assert.ok(result instanceof DeadlockError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps SQLITE_PROTOCOL to LockNotAvailableError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_PROTOCOL', 15, 'SQLITE_PROTOCOL: locking protocol'),
      );
      assert.ok(result instanceof LockNotAvailableError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('connection errors', () => {
    void it('maps SQLITE_CANTOPEN to ConnectionError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_CANTOPEN',
          14,
          'SQLITE_CANTOPEN: unable to open database file',
        ),
      );
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps SQLITE_NOTADB to ConnectionError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_NOTADB',
          26,
          'SQLITE_NOTADB: file is not a database',
        ),
      );
      assert.ok(result instanceof ConnectionError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('resource errors', () => {
    void it('maps SQLITE_NOMEM to InsufficientResourcesError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_NOMEM', 7, 'SQLITE_NOMEM: out of memory'),
      );
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps SQLITE_FULL to InsufficientResourcesError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_FULL', 13, 'SQLITE_FULL: database or disk is full'),
      );
      assert.ok(result instanceof InsufficientResourcesError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('system / I/O errors', () => {
    void it('maps SQLITE_IOERR to SystemError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_IOERR', 10, 'SQLITE_IOERR: disk I/O error'),
      );
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps SQLITE_CORRUPT to SystemError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_CORRUPT',
          11,
          'SQLITE_CORRUPT: database disk image is malformed',
        ),
      );
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps SQLITE_INTERNAL to SystemError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_INTERNAL', 2, 'SQLITE_INTERNAL: internal error'),
      );
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps SQLITE_NOLFS to SystemError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_NOLFS',
          22,
          'SQLITE_NOLFS: large file support is disabled',
        ),
      );
      assert.ok(result instanceof SystemError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('data errors', () => {
    void it('maps SQLITE_TOOBIG to DataError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_TOOBIG',
          18,
          'SQLITE_TOOBIG: string or blob too big',
        ),
      );
      assert.ok(result instanceof DataError);
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.errorCode, 400);
    });

    void it('maps SQLITE_MISMATCH to DataError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_MISMATCH',
          20,
          'SQLITE_MISMATCH: datatype mismatch',
        ),
      );
      assert.ok(result instanceof DataError);
    });

    void it('maps SQLITE_RANGE to DataError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_RANGE',
          25,
          'SQLITE_RANGE: column index out of range',
        ),
      );
      assert.ok(result instanceof DataError);
    });
  });

  void describe('invalid operation errors', () => {
    void it('maps SQLITE_ERROR to InvalidOperationError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_ERROR', 1, 'SQLITE_ERROR: no such table: foo'),
      );
      assert.ok(result instanceof InvalidOperationError);
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.errorCode, 400);
    });

    void it('maps SQLITE_READONLY to InvalidOperationError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_READONLY',
          8,
          'SQLITE_READONLY: attempt to write a readonly database',
        ),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps SQLITE_MISUSE to InvalidOperationError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_MISUSE',
          21,
          'SQLITE_MISUSE: library routine called out of sequence',
        ),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps SQLITE_AUTH to InvalidOperationError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_AUTH', 23, 'SQLITE_AUTH: authorization denied'),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps SQLITE_PERM to InvalidOperationError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_PERM', 3, 'SQLITE_PERM: access permission denied'),
      );
      assert.ok(result instanceof InvalidOperationError);
    });

    void it('maps SQLITE_SCHEMA to InvalidOperationError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_SCHEMA',
          17,
          'SQLITE_SCHEMA: database schema has changed',
        ),
      );
      assert.ok(result instanceof InvalidOperationError);
    });
  });

  void describe('serialization / abort errors', () => {
    void it('maps SQLITE_ABORT to SerializationError', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_ABORT',
          4,
          'SQLITE_ABORT: callback requested query abort',
        ),
      );
      assert.ok(result instanceof SerializationError);
      assert.ok(result instanceof TransientDatabaseError);
    });

    void it('maps SQLITE_INTERRUPT to SerializationError', () => {
      const result = mapSqliteError(
        sqliteError('SQLITE_INTERRUPT', 9, 'SQLITE_INTERRUPT: interrupted'),
      );
      assert.ok(result instanceof SerializationError);
      assert.ok(result instanceof TransientDatabaseError);
    });
  });

  void describe('preserves inner error', () => {
    void it('sets innerError to original error', () => {
      const original = sqliteError(
        'SQLITE_CONSTRAINT',
        19,
        'SQLITE_CONSTRAINT: UNIQUE constraint failed: users.id',
      );
      const result = mapSqliteError(original);
      assert.ok(result instanceof DumboError);
      assert.strictEqual(result.innerError, original);
      assert.strictEqual(result.cause, original);
    });

    void it('preserves original error message', () => {
      const result = mapSqliteError(
        sqliteError(
          'SQLITE_CONSTRAINT',
          19,
          'SQLITE_CONSTRAINT: UNIQUE constraint failed: users.id',
        ),
      );
      assert.ok(result);
      assert.strictEqual(
        result.message,
        'SQLITE_CONSTRAINT: UNIQUE constraint failed: users.id',
      );
    });
  });
});
