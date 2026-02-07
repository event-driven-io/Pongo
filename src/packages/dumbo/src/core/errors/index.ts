const isNumber = (val: unknown): val is number =>
  typeof val === 'number' && val === val;

const isString = (val: unknown): val is string => typeof val === 'string';

export class DumboError extends Error {
  public errorCode: number;
  public innerError: Error | undefined;

  constructor(
    options?:
      | {
          errorCode: number;
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
          : 500;
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
    this.innerError = innerError;

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, DumboError.prototype);
  }
}

export class ConcurrencyError extends DumboError {
  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: 412,
      message: message ?? `Expected document state does not match current one!`,
      innerError,
    });

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, ConcurrencyError.prototype);
  }
}

export class TransientDatabaseError extends DumboError {
  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: 503,
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
  constructor(message?: string, innerError?: Error) {
    super(
      message ?? `A connection error occurred during database operation.`,
      innerError,
    );

    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

export class SerializationError extends TransientDatabaseError {
  constructor(message?: string, innerError?: Error) {
    super(
      message ??
        `A serialization failure occurred. The transaction can be retried.`,
      innerError,
    );

    Object.setPrototypeOf(this, SerializationError.prototype);
  }
}

export class DeadlockError extends TransientDatabaseError {
  constructor(message?: string, innerError?: Error) {
    super(
      message ?? `A deadlock was detected. The transaction can be retried.`,
      innerError,
    );

    Object.setPrototypeOf(this, DeadlockError.prototype);
  }
}

export class LockNotAvailableError extends TransientDatabaseError {
  constructor(message?: string, innerError?: Error) {
    super(message ?? `The requested lock is not available.`, innerError);

    Object.setPrototypeOf(this, LockNotAvailableError.prototype);
  }
}

export class InsufficientResourcesError extends TransientDatabaseError {
  constructor(message?: string, innerError?: Error) {
    super(
      message ??
        `Insufficient resources to complete the database operation (e.g. disk full, out of memory, too many connections).`,
      innerError,
    );

    Object.setPrototypeOf(this, InsufficientResourcesError.prototype);
  }
}

export class SystemError extends TransientDatabaseError {
  constructor(message?: string, innerError?: Error) {
    super(
      message ?? `A system-level error occurred (e.g. I/O error).`,
      innerError,
    );

    Object.setPrototypeOf(this, SystemError.prototype);
  }
}

export class AdminShutdownError extends TransientDatabaseError {
  constructor(message?: string, innerError?: Error) {
    super(
      message ?? `The database server is shutting down or restarting.`,
      innerError,
    );

    Object.setPrototypeOf(this, AdminShutdownError.prototype);
  }
}

export class QueryCanceledError extends TransientDatabaseError {
  constructor(message?: string, innerError?: Error) {
    super(
      message ??
        `The query was canceled, e.g. due to statement timeout or user request.`,
      innerError,
    );

    Object.setPrototypeOf(this, QueryCanceledError.prototype);
  }
}

export class IntegrityConstraintViolationError extends DumboError {
  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: 409,
      message: message ?? `An integrity constraint violation occurred!`,
      innerError,
    });

    Object.setPrototypeOf(this, IntegrityConstraintViolationError.prototype);
  }
}

export class UniqueConstraintError extends IntegrityConstraintViolationError {
  constructor(message?: string, innerError?: Error) {
    super(message ?? `Unique constraint violation occurred!`, innerError);

    Object.setPrototypeOf(this, UniqueConstraintError.prototype);
  }
}

export class ForeignKeyViolationError extends IntegrityConstraintViolationError {
  constructor(message?: string, innerError?: Error) {
    super(message ?? `Foreign key constraint violation occurred!`, innerError);

    Object.setPrototypeOf(this, ForeignKeyViolationError.prototype);
  }
}

export class NotNullViolationError extends IntegrityConstraintViolationError {
  constructor(message?: string, innerError?: Error) {
    super(message ?? `NOT NULL constraint violation occurred!`, innerError);

    Object.setPrototypeOf(this, NotNullViolationError.prototype);
  }
}

export class CheckViolationError extends IntegrityConstraintViolationError {
  constructor(message?: string, innerError?: Error) {
    super(message ?? `CHECK constraint violation occurred!`, innerError);

    Object.setPrototypeOf(this, CheckViolationError.prototype);
  }
}

export class ExclusionViolationError extends IntegrityConstraintViolationError {
  constructor(message?: string, innerError?: Error) {
    super(message ?? `Exclusion constraint violation occurred!`, innerError);

    Object.setPrototypeOf(this, ExclusionViolationError.prototype);
  }
}

export class DataError extends DumboError {
  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: 400,
      message:
        message ?? `A data error occurred (e.g. invalid value, type mismatch).`,
      innerError,
    });

    Object.setPrototypeOf(this, DataError.prototype);
  }
}

export class InvalidOperationError extends DumboError {
  constructor(message?: string, innerError?: Error) {
    super({
      errorCode: 400,
      message:
        message ??
        `Invalid operation (e.g. syntax error, insufficient privileges, undefined table).`,
      innerError,
    });

    Object.setPrototypeOf(this, InvalidOperationError.prototype);
  }
}
