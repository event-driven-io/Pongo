const isNumber = (val: unknown): val is number =>
  typeof val === 'number' && val === val;

const isString = (val: unknown): val is string => typeof val === 'string';

export class DumboError extends Error {
  static readonly ErrorCode: number = 500;
  static readonly ErrorType: string = 'DumboError';

  public errorCode: number;
  public errorType: string;
  public innerError: Error | undefined;

  constructor(
    options?:
      | {
          errorCode: number;
          errorType?: string;
          message?: string | undefined;
          innerError?: Error | undefined;
        }
      | string
      | number,
  ) {
    const errorCode =
      options && typeof options === 'object' && 'errorCode' in options
        ? options.errorCode
        : isNumber(options)
          ? options
          : DumboError.ErrorCode;
    const errorType =
      options && typeof options === 'object' && 'errorType' in options
        ? (options.errorType ?? DumboError.ErrorType)
        : DumboError.ErrorType;
    const message =
      options && typeof options === 'object' && 'message' in options
        ? options.message
        : isString(options)
          ? options
          : `Error with status code '${errorCode}' ocurred during DumboError processing`;
    const innerError =
      options && typeof options === 'object' && 'innerError' in options
        ? options.innerError
        : undefined;

    super(message, { cause: innerError });
    this.errorCode = errorCode;
    this.errorType = errorType;
    this.innerError = innerError;

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, DumboError.prototype);
  }

  public static isInstanceOf<ErrorType extends DumboError = DumboError>(
    error: unknown,
    options?: { errorCode?: number; errorType?: string },
  ): error is ErrorType {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('errorCode' in error) ||
      !isNumber(error.errorCode) ||
      !('errorType' in error) ||
      !isString(error.errorType)
    )
      return false;

    if (!options) return true;

    if (
      options.errorCode !== undefined &&
      error.errorCode !== options.errorCode
    )
      return false;
    if (
      options.errorType !== undefined &&
      error.errorType !== options.errorType
    )
      return false;

    return true;
  }
}

export class ConcurrencyError extends DumboError {
  static readonly ErrorCode: number = 412;
  static readonly ErrorType: string = 'ConcurrencyError';

  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: ConcurrencyError.ErrorCode,
      errorType: ConcurrencyError.ErrorType,
      message: message ?? `Expected document state does not match current one!`,
      innerError,
    });

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, ConcurrencyError.prototype);
  }
}

export class TransientDatabaseError extends DumboError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'TransientDatabaseError';

  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: TransientDatabaseError.ErrorCode,
      errorType: TransientDatabaseError.ErrorType,
      message:
        message ??
        `A transient error occurred during database operation. Retrying the operation might succeed.`,
      innerError,
    });

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, TransientDatabaseError.prototype);
  }
}

export class ConnectionError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'ConnectionError';

  constructor(message?: string, innerError?: Error) {
    super(
      message ?? `A connection error occurred during database operation.`,
      innerError,
    );
    this.errorType = ConnectionError.ErrorType;

    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

export class SerializationError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'SerializationError';

  constructor(message?: string, innerError?: Error) {
    super(
      message ??
        `A serialization failure occurred. The transaction can be retried.`,
      innerError,
    );
    this.errorType = SerializationError.ErrorType;

    Object.setPrototypeOf(this, SerializationError.prototype);
  }
}

export class DeadlockError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'DeadlockError';

  constructor(message?: string, innerError?: Error) {
    super(
      message ?? `A deadlock was detected. The transaction can be retried.`,
      innerError,
    );
    this.errorType = DeadlockError.ErrorType;

    Object.setPrototypeOf(this, DeadlockError.prototype);
  }
}

export class LockNotAvailableError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'LockNotAvailableError';

  constructor(message?: string, innerError?: Error) {
    super(message ?? `The requested lock is not available.`, innerError);
    this.errorType = LockNotAvailableError.ErrorType;

    Object.setPrototypeOf(this, LockNotAvailableError.prototype);
  }
}

export class InsufficientResourcesError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'InsufficientResourcesError';

  constructor(message?: string, innerError?: Error) {
    super(
      message ??
        `Insufficient resources to complete the database operation (e.g. disk full, out of memory, too many connections).`,
      innerError,
    );
    this.errorType = InsufficientResourcesError.ErrorType;

    Object.setPrototypeOf(this, InsufficientResourcesError.prototype);
  }
}

export class SystemError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'SystemError';

  constructor(message?: string, innerError?: Error) {
    super(
      message ?? `A system-level error occurred (e.g. I/O error).`,
      innerError,
    );
    this.errorType = SystemError.ErrorType;

    Object.setPrototypeOf(this, SystemError.prototype);
  }
}

export class AdminShutdownError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'AdminShutdownError';

  constructor(message?: string, innerError?: Error) {
    super(
      message ?? `The database server is shutting down or restarting.`,
      innerError,
    );
    this.errorType = AdminShutdownError.ErrorType;

    Object.setPrototypeOf(this, AdminShutdownError.prototype);
  }
}

export class QueryCanceledError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'QueryCanceledError';

  constructor(message?: string, innerError?: Error) {
    super(
      message ??
        `The query was canceled, e.g. due to statement timeout or user request.`,
      innerError,
    );
    this.errorType = QueryCanceledError.ErrorType;

    Object.setPrototypeOf(this, QueryCanceledError.prototype);
  }
}

export class IntegrityConstraintViolationError extends DumboError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'IntegrityConstraintViolationError';

  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: IntegrityConstraintViolationError.ErrorCode,
      errorType: IntegrityConstraintViolationError.ErrorType,
      message: message ?? `An integrity constraint violation occurred!`,
      innerError,
    });

    Object.setPrototypeOf(this, IntegrityConstraintViolationError.prototype);
  }
}

export class UniqueConstraintError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'UniqueConstraintError';

  constructor(message?: string, innerError?: Error) {
    super(message ?? `Unique constraint violation occurred!`, innerError);
    this.errorType = UniqueConstraintError.ErrorType;

    Object.setPrototypeOf(this, UniqueConstraintError.prototype);
  }
}

export class ForeignKeyViolationError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'ForeignKeyViolationError';

  constructor(message?: string, innerError?: Error) {
    super(message ?? `Foreign key constraint violation occurred!`, innerError);
    this.errorType = ForeignKeyViolationError.ErrorType;

    Object.setPrototypeOf(this, ForeignKeyViolationError.prototype);
  }
}

export class NotNullViolationError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'NotNullViolationError';

  constructor(message?: string, innerError?: Error) {
    super(message ?? `NOT NULL constraint violation occurred!`, innerError);
    this.errorType = NotNullViolationError.ErrorType;

    Object.setPrototypeOf(this, NotNullViolationError.prototype);
  }
}

export class CheckViolationError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'CheckViolationError';

  constructor(message?: string, innerError?: Error) {
    super(message ?? `CHECK constraint violation occurred!`, innerError);
    this.errorType = CheckViolationError.ErrorType;

    Object.setPrototypeOf(this, CheckViolationError.prototype);
  }
}

export class ExclusionViolationError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'ExclusionViolationError';

  constructor(message?: string, innerError?: Error) {
    super(message ?? `Exclusion constraint violation occurred!`, innerError);
    this.errorType = ExclusionViolationError.ErrorType;

    Object.setPrototypeOf(this, ExclusionViolationError.prototype);
  }
}

export class DataError extends DumboError {
  static readonly ErrorCode: number = 400;
  static readonly ErrorType: string = 'DataError';

  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: DataError.ErrorCode,
      errorType: DataError.ErrorType,
      message:
        message ?? `A data error occurred (e.g. invalid value, type mismatch).`,
      innerError,
    });

    Object.setPrototypeOf(this, DataError.prototype);
  }
}

export class InvalidOperationError extends DumboError {
  static readonly ErrorCode: number = 400;
  static readonly ErrorType: string = 'InvalidOperationError';

  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: InvalidOperationError.ErrorCode,
      errorType: InvalidOperationError.ErrorType,
      message:
        message ??
        `Invalid operation (e.g. syntax error, insufficient privileges, undefined table).`,
      innerError,
    });

    Object.setPrototypeOf(this, InvalidOperationError.prototype);
  }
}
