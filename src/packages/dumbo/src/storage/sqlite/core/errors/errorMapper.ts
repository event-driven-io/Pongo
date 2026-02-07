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
  UniqueConstraintError,
} from '../../../../core/errors';

/**
 * Extracts the SQLite error code string from a `sqlite3` driver error.
 *
 * The `sqlite3` (node-sqlite3) driver sets `error.code` to a string like
 * `'SQLITE_CONSTRAINT'` and `error.errno` to the numeric result code.
 * See: https://github.com/TryGhost/node-sqlite3
 */
const getSqliteErrorCode = (error: unknown): string | undefined => {
  if (
    error instanceof Error &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string'
  ) {
    return (error as Record<string, unknown>).code as string;
  }
  return undefined;
};

const getErrorMessage = (error: unknown): string | undefined =>
  error instanceof Error ? error.message : undefined;

const asError = (error: unknown): Error | undefined =>
  error instanceof Error ? error : undefined;

/**
 * Maps a constraint error to a specific DumboError subtype by inspecting the
 * error message. The `sqlite3` driver only exposes the primary result code
 * `SQLITE_CONSTRAINT` — the constraint subtype (UNIQUE, FOREIGN KEY, etc.)
 * is embedded in the message string by SQLite, e.g.:
 *   "SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email"
 *
 * Reference: https://www.sqlite.org/rescode.html (extended result codes 275–3091)
 */
const mapConstraintError = (
  message: string | undefined,
  innerError: Error | undefined,
): DumboError => {
  const upperMessage = message?.toUpperCase() ?? '';

  // SQLITE_CONSTRAINT_UNIQUE (2067) / SQLITE_CONSTRAINT_PRIMARYKEY (1555)
  if (upperMessage.includes('UNIQUE') || upperMessage.includes('PRIMARY KEY'))
    return new UniqueConstraintError(message, innerError);

  // SQLITE_CONSTRAINT_FOREIGNKEY (787)
  if (upperMessage.includes('FOREIGN KEY'))
    return new ForeignKeyViolationError(message, innerError);

  // SQLITE_CONSTRAINT_NOTNULL (1299)
  if (upperMessage.includes('NOT NULL'))
    return new NotNullViolationError(message, innerError);

  // SQLITE_CONSTRAINT_CHECK (275)
  if (upperMessage.includes('CHECK'))
    return new CheckViolationError(message, innerError);

  // SQLITE_CONSTRAINT_ROWID (2579), SQLITE_CONSTRAINT_TRIGGER (1811),
  // SQLITE_CONSTRAINT_COMMITHOOK (531), SQLITE_CONSTRAINT_PINNED (2835),
  // SQLITE_CONSTRAINT_DATATYPE (3091), etc.
  return new IntegrityConstraintViolationError(message, innerError);
};

/**
 * Maps a SQLite error (from the `sqlite3` / node-sqlite3 driver) to a typed
 * DumboError based on the SQLite result code.
 *
 * Result code reference: https://www.sqlite.org/rescode.html
 *
 * Falls back to a generic DumboError (500) if the error is not a recognized SQLite error.
 */
export const mapSqliteError = (error: unknown): DumboError => {
  const code = getSqliteErrorCode(error);
  if (!code)
    return new DumboError({
      errorCode: 500,
      message: getErrorMessage(error),
      innerError: asError(error),
    });

  const message = getErrorMessage(error);
  const innerError = asError(error);

  switch (code) {
    // ── Constraint violations (19) ──
    // node-sqlite3 only exposes the primary code; subtype is in the message.
    case 'SQLITE_CONSTRAINT':
      return mapConstraintError(message, innerError);

    // ── Busy / lock contention ──
    // SQLITE_BUSY (5): conflict with a separate database connection
    case 'SQLITE_BUSY':
      return new LockNotAvailableError(message, innerError);

    // SQLITE_LOCKED (6): conflict within the same connection or shared cache
    case 'SQLITE_LOCKED':
      return new DeadlockError(message, innerError);

    // SQLITE_PROTOCOL (15): WAL locking race condition
    case 'SQLITE_PROTOCOL':
      return new LockNotAvailableError(message, innerError);

    // ── Connection / open errors ──
    // SQLITE_CANTOPEN (14): unable to open database file
    case 'SQLITE_CANTOPEN':
      return new ConnectionError(message, innerError);

    // SQLITE_NOTADB (26): file is not a database
    case 'SQLITE_NOTADB':
      return new ConnectionError(message, innerError);

    // ── Resource exhaustion ──
    // SQLITE_NOMEM (7): out of memory
    case 'SQLITE_NOMEM':
      return new InsufficientResourcesError(message, innerError);

    // SQLITE_FULL (13): disk full
    case 'SQLITE_FULL':
      return new InsufficientResourcesError(message, innerError);

    // ── System / I/O errors ──
    // SQLITE_IOERR (10): operating system I/O error
    case 'SQLITE_IOERR':
      return new SystemError(message, innerError);

    // SQLITE_CORRUPT (11): database file is corrupted
    case 'SQLITE_CORRUPT':
      return new SystemError(message, innerError);

    // SQLITE_INTERNAL (2): internal SQLite malfunction
    case 'SQLITE_INTERNAL':
      return new SystemError(message, innerError);

    // SQLITE_NOLFS (22): large file support unavailable
    case 'SQLITE_NOLFS':
      return new SystemError(message, innerError);

    // ── Data errors ──
    // SQLITE_TOOBIG (18): string or BLOB too large
    case 'SQLITE_TOOBIG':
      return new DataError(message, innerError);

    // SQLITE_MISMATCH (20): datatype mismatch
    case 'SQLITE_MISMATCH':
      return new DataError(message, innerError);

    // SQLITE_RANGE (25): bind parameter index out of range
    case 'SQLITE_RANGE':
      return new DataError(message, innerError);

    // ── Invalid operations ──
    // SQLITE_ERROR (1): generic SQL error (syntax errors, missing tables, etc.)
    case 'SQLITE_ERROR':
      return new InvalidOperationError(message, innerError);

    // SQLITE_READONLY (8): attempt to write to a read-only database
    case 'SQLITE_READONLY':
      return new InvalidOperationError(message, innerError);

    // SQLITE_MISUSE (21): API misuse
    case 'SQLITE_MISUSE':
      return new InvalidOperationError(message, innerError);

    // SQLITE_AUTH (23): authorization denied
    case 'SQLITE_AUTH':
      return new InvalidOperationError(message, innerError);

    // SQLITE_PERM (3): access permission denied
    case 'SQLITE_PERM':
      return new InvalidOperationError(message, innerError);

    // SQLITE_SCHEMA (17): schema changed, statement needs re-preparation
    case 'SQLITE_SCHEMA':
      return new InvalidOperationError(message, innerError);

    // ── Transaction / abort ──
    // SQLITE_ABORT (4): operation aborted (e.g. by rollback)
    case 'SQLITE_ABORT':
      return new SerializationError(message, innerError);

    // SQLITE_INTERRUPT (9): operation interrupted
    case 'SQLITE_INTERRUPT':
      return new SerializationError(message, innerError);
  }

  return new DumboError({
    errorCode: 500,
    message,
    innerError,
  });
};
