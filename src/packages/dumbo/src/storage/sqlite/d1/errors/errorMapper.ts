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

const getErrorMessage = (error: unknown): string | undefined =>
  error instanceof Error ? error.message : undefined;

const asError = (error: unknown): Error | undefined =>
  error instanceof Error ? error : undefined;

/**
 * Determines the constraint subtype from the error message.
 *
 * D1 embeds the SQLite constraint detail in the message string, e.g.:
 *   "D1_ERROR: UNIQUE constraint failed: users.email"
 *   "D1_ERROR: SQLITE_CONSTRAINT: FOREIGN KEY constraint failed"
 */
const mapConstraintError = (
  message: string | undefined,
  innerError: Error | undefined,
): DumboError => {
  const upperMessage = message?.toUpperCase() ?? '';

  if (upperMessage.includes('UNIQUE') || upperMessage.includes('PRIMARY KEY'))
    return new UniqueConstraintError(message, innerError);

  if (upperMessage.includes('FOREIGN KEY'))
    return new ForeignKeyViolationError(message, innerError);

  if (upperMessage.includes('NOT NULL'))
    return new NotNullViolationError(message, innerError);

  if (upperMessage.includes('CHECK'))
    return new CheckViolationError(message, innerError);

  return new IntegrityConstraintViolationError(message, innerError);
};

const isConstraintMessage = (upper: string): boolean =>
  upper.includes('CONSTRAINT') ||
  upper.includes('UNIQUE') ||
  upper.includes('PRIMARY KEY') ||
  upper.includes('FOREIGN KEY') ||
  upper.includes('NOT NULL');

/** Extracts the first `SQLITE_<CODE>` token from a message string. */
const SQLITE_CODE_RE = /SQLITE_([A-Z]+)/;

const extractEmbeddedSqliteCode = (message: string): string | undefined => {
  const match = SQLITE_CODE_RE.exec(message);
  return match ? `SQLITE_${match[1]}` : undefined;
};

/**
 * Maps a `SQLITE_*` code found in the D1 message to a DumboError.
 *
 * D1 sometimes forwards raw SQLite result codes from the C++ layer, e.g.:
 *   "D1_ERROR: SQLITE_BUSY: database is locked"
 *   "SQLITE_READONLY: attempt to write a readonly database"
 *
 * See https://www.sqlite.org/rescode.html for the full code list.
 */
const mapEmbeddedSqliteCode = (
  code: string,
  message: string | undefined,
  innerError: Error | undefined,
): DumboError | undefined => {
  switch (code) {
    case 'SQLITE_CONSTRAINT':
      return mapConstraintError(message, innerError);
    case 'SQLITE_BUSY':
      return new LockNotAvailableError(message, innerError);
    case 'SQLITE_LOCKED':
      return new DeadlockError(message, innerError);
    case 'SQLITE_PROTOCOL':
      return new LockNotAvailableError(message, innerError);
    case 'SQLITE_CANTOPEN':
      return new ConnectionError(message, innerError);
    case 'SQLITE_NOTADB':
      return new ConnectionError(message, innerError);
    case 'SQLITE_NOMEM':
      return new InsufficientResourcesError(message, innerError);
    case 'SQLITE_FULL':
      return new InsufficientResourcesError(message, innerError);
    case 'SQLITE_IOERR':
      return new SystemError(message, innerError);
    case 'SQLITE_CORRUPT':
      return new SystemError(message, innerError);
    case 'SQLITE_INTERNAL':
      return new SystemError(message, innerError);
    case 'SQLITE_NOLFS':
      return new SystemError(message, innerError);
    case 'SQLITE_TOOBIG':
      return new DataError(message, innerError);
    case 'SQLITE_MISMATCH':
      return new DataError(message, innerError);
    case 'SQLITE_RANGE':
      return new DataError(message, innerError);
    case 'SQLITE_ERROR':
      return new InvalidOperationError(message, innerError);
    case 'SQLITE_READONLY':
      return new InvalidOperationError(message, innerError);
    case 'SQLITE_MISUSE':
      return new InvalidOperationError(message, innerError);
    case 'SQLITE_AUTH':
      return new InvalidOperationError(message, innerError);
    case 'SQLITE_PERM':
      return new InvalidOperationError(message, innerError);
    case 'SQLITE_SCHEMA':
      return new InvalidOperationError(message, innerError);
    case 'SQLITE_ABORT':
      return new SerializationError(message, innerError);
    case 'SQLITE_INTERRUPT':
      return new SerializationError(message, innerError);
  }
  return undefined;
};

/**
 * Maps a Cloudflare D1 error to a typed DumboError.
 *
 * Unlike node-sqlite3, D1 throws **plain `Error` objects** with no `code`
 * property. All error information is embedded in `error.message`, using
 * well-known prefixes from the `workerd` runtime:
 *
 * | Prefix                | Meaning                                      |
 * |-----------------------|----------------------------------------------|
 * | `D1_ERROR:`           | General D1 / SQLite error                    |
 * | `D1_EXEC_ERROR:`      | Error during `.exec()` batch                 |
 * | `D1_TYPE_ERROR:`      | Type mismatch (e.g. `undefined` vs `null`)   |
 * | `D1_COLUMN_NOTFOUND`  | Referenced column does not exist              |
 * | `D1_DUMP_ERROR:`      | Error during database dump                   |
 * | `D1_SESSION_ERROR:`   | Session bookmark / constraint error           |
 *
 * D1 also surfaces platform-level messages (no prefix) for transient errors:
 *   - "Network connection lost."
 *   - "D1 DB is overloaded. Too many requests queued."
 *   - "Memory limit would be exceeded by this operation."
 *   - "Cannot resolve D1 DB due to transient issue on remote node."
 *   - "D1 DB reset because its code was updated."
 *
 * Reference:
 *   - https://developers.cloudflare.com/d1/platform/client-api/
 *   - https://github.com/cloudflare/workerd (src/cloudflare/internal/d1-api.ts)
 *
 * Falls back to a generic DumboError (500) if the error is not a recognized D1 error.
 */
export const mapD1Error = (error: unknown): DumboError => {
  const message = getErrorMessage(error);
  if (!message)
    return new DumboError({
      errorCode: 500,
      message: error instanceof Error ? error.message : String(error),
      innerError: asError(error),
    });

  const innerError = asError(error);
  const upper = message.toUpperCase();

  // D1-specific prefixes are checked first because some (e.g. D1_SESSION_ERROR)
  // contain constraint keywords in their message but have different semantics.
  if (upper.startsWith('D1_TYPE_ERROR'))
    return new DataError(message, innerError);

  if (upper.startsWith('D1_COLUMN_NOTFOUND'))
    return new DataError(message, innerError);

  if (upper.startsWith('D1_DUMP_ERROR'))
    return new SystemError(message, innerError);

  if (upper.startsWith('D1_SESSION_ERROR'))
    return new ConnectionError(message, innerError);

  if (isConstraintMessage(upper)) {
    return mapConstraintError(message, innerError);
  }

  if (
    upper.includes('NETWORK CONNECTION LOST') ||
    upper.includes('CANNOT RESOLVE D1 DB DUE TO TRANSIENT ISSUE') ||
    upper.includes('D1 DB RESET BECAUSE')
  )
    return new ConnectionError(message, innerError);

  if (
    upper.includes('D1 DB IS OVERLOADED') ||
    upper.includes('TOO MANY REQUESTS') ||
    upper.includes('MEMORY LIMIT WOULD BE EXCEEDED')
  )
    return new InsufficientResourcesError(message, innerError);

  if (upper.startsWith('D1_ERROR') || upper.startsWith('D1_EXEC_ERROR')) {
    const embeddedCode = extractEmbeddedSqliteCode(message);
    if (embeddedCode) {
      const mapped = mapEmbeddedSqliteCode(embeddedCode, message, innerError);
      if (mapped) return mapped;
    }

    return new InvalidOperationError(message, innerError);
  }

  const embeddedCode = extractEmbeddedSqliteCode(message);
  if (embeddedCode) {
    const mapped = mapEmbeddedSqliteCode(embeddedCode, message, innerError);
    if (mapped) return mapped;
  }

  return new DumboError({
    errorCode: 500,
    message,
    innerError,
  });
};
