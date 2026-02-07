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
  UniqueConstraintError,
} from '../../../../core/errors';

/**
 * Checks whether the given error looks like a PostgreSQL DatabaseError
 * from the `pg` driver (has a string `code` property with a SQLSTATE value).
 */
const getPostgresErrorCode = (error: unknown): string | undefined => {
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
 * Maps a PostgreSQL error (from the `pg` driver) to a typed DumboError
 * based on the SQLSTATE code.
 *
 * SQLSTATE reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 * Transient classification based on Npgsql's PostgresException.IsTransient.
 *
 * Falls back to a generic DumboError (500) if the error is not a recognized PostgreSQL error.
 */
export const mapPostgresError = (error: unknown): DumboError => {
  if (DumboError.isInstanceOf<DumboError>(error)) return error;

  const code = getPostgresErrorCode(error);
  if (!code)
    return new DumboError({
      errorCode: 500,
      message: getErrorMessage(error),
      innerError: asError(error),
    });

  const message = getErrorMessage(error);
  const innerError = asError(error);

  // Exact SQLSTATE matches first, then class prefix fallbacks

  switch (code) {
    // ── Class 23: Integrity Constraint Violations ──
    case '23505':
      return new UniqueConstraintError(message, innerError);
    case '23503':
      return new ForeignKeyViolationError(message, innerError);
    case '23502':
      return new NotNullViolationError(message, innerError);
    case '23514':
      return new CheckViolationError(message, innerError);
    case '23P01':
      return new ExclusionViolationError(message, innerError);

    // ── Class 40: Transaction Rollback ──
    case '40001':
      return new SerializationError(message, innerError);
    case '40P01':
      return new DeadlockError(message, innerError);

    // ── Class 55: Object Not In Prerequisite State ──
    case '55P03':
    case '55006':
      return new LockNotAvailableError(message, innerError);

    // ── Class 57: Operator Intervention ──
    case '57014': // query_canceled (e.g. statement timeout)
      return new QueryCanceledError(message, innerError);
    case '57P01': // admin shutdown
    case '57P02': // crash shutdown
      return new AdminShutdownError(message, innerError);
    case '57P03': // cannot connect now
    case '57P05': // idle session timeout
      return new ConnectionError(message, innerError);
  }

  // Class prefix fallbacks (first 2 characters of the SQLSTATE code)
  const sqlClass = code.slice(0, 2);

  switch (sqlClass) {
    // ── Class 08: Connection Exception ──
    case '08':
      return new ConnectionError(message, innerError);

    // ── Class 22: Data Exception ──
    case '22':
      return new DataError(message, innerError);

    // ── Class 23: Integrity Constraint (fallback for unknown codes) ──
    case '23':
      return new IntegrityConstraintViolationError(message, innerError);

    // ── Class 42: Syntax Error or Access Rule Violation ──
    case '42':
      return new InvalidOperationError(message, innerError);

    // ── Class 53: Insufficient Resources ──
    case '53':
      return new InsufficientResourcesError(message, innerError);

    // ── Class 57: Operator Intervention (fallback) ──
    case '57':
      return new ConnectionError(message, innerError);

    // ── Class 58: System Error ──
    case '58':
      return new SystemError(message, innerError);
  }

  return new DumboError({
    errorCode: 500,
    message,
    innerError,
  });
};
