const isNumber = (val: unknown): val is number =>
  typeof val === 'number' && val === val;

const isString = (val: unknown): val is string => typeof val === 'string';

export const DumboErrorTypeId = Symbol.for('@event-driven-io/dumbo/DumboError');

export type DumboErrorOptions = {
  status: number;
  message?: string | undefined;
  code?: string | undefined;
  cause?: unknown;
  details?: Record<string, unknown> | undefined;
};

export class DumboError extends Error {
  static readonly ErrorCode: number = 500;
  static readonly ErrorType: string = 'DumboError';

  public status: number;
  public code: string;
  public details?: Record<string, unknown> | undefined;

  /**
   * @deprecated Use `status` instead.
   */
  public errorCode: number;
  /**
   * @deprecated Use `code` instead.
   */
  public errorType: string;
  /**
   * @deprecated Use `cause` instead.
   */
  public innerError: Error | undefined;

  constructor(
    options?:
      | DumboErrorOptions
      | {
          errorCode: number;
          errorType?: string;
          message?: string | undefined;
          innerError?: Error | undefined;
        }
      | string
      | number,
  ) {
    const status =
      options && typeof options === 'object'
        ? 'status' in options
          ? options.status
          : options.errorCode
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
          : `Error with status code '${status}' ocurred during DumboError processing`;
    const { code, cause, details }: Partial<DumboErrorOptions> =
      options && typeof options === 'object'
        ? 'status' in options
          ? options
          : { cause: options.innerError }
        : {};

    super(message, { cause });
    this.status = status;
    this.errorCode = status;
    this.code = code ?? 'DMB_ERR_INTERNAL';
    this.details = details;
    this.errorType = errorType;
    this.innerError = cause as Error | undefined;
    Object.defineProperty(this, DumboErrorTypeId, { value: true });

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, DumboError.prototype);
  }

  public static isInstanceOf<ErrorType extends DumboError = DumboError>(
    error: unknown,
    options?: {
      status?: number;
      code?: string;
      errorCode?: number;
      errorType?: string;
    },
  ): error is ErrorType {
    if (
      typeof error !== 'object' ||
      error === null ||
      !(DumboErrorTypeId in error)
    )
      return false;

    if (!options) return true;

    const { status, code, errorCode, errorType } = error as Partial<DumboError>;

    if (options.status !== undefined && status !== options.status) return false;
    if (options.code !== undefined && code !== options.code) return false;
    if (options.errorCode !== undefined && errorCode !== options.errorCode)
      return false;
    if (options.errorType !== undefined && errorType !== options.errorType)
      return false;

    return true;
  }
}

export class ConcurrencyError extends DumboError {
  static readonly ErrorCode: number = 412;
  static readonly ErrorType: string = 'ConcurrencyError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super({
      ...rest,
      cause: rest.cause ?? innerError,
      status: ConcurrencyError.ErrorCode,
      code: rest.code ?? 'DMB_ERR_CONCURRENCY',
      message: message ?? `Expected document state does not match current one!`,
    });
    this.errorType = ConcurrencyError.ErrorType;

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, ConcurrencyError.prototype);
  }
}

export class TransientDatabaseError extends DumboError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'TransientDatabaseError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super({
      ...rest,
      cause: rest.cause ?? innerError,
      status: TransientDatabaseError.ErrorCode,
      code: rest.code ?? 'DMB_ERR_TRANSIENT_DATABASE',
      message:
        message ??
        `A transient error occurred during database operation. Retrying the operation might succeed.`,
    });
    this.errorType = TransientDatabaseError.ErrorType;

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, TransientDatabaseError.prototype);
  }
}

export class ConnectionError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'ConnectionError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_CONNECTION',
        message:
          message ?? `A connection error occurred during database operation.`,
      },
      innerError,
    );
    this.errorType = ConnectionError.ErrorType;

    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}
export class IllegalStateError extends DumboError {
  static readonly ErrorCode: number = 403;
  static readonly ErrorType: string = 'IllegalStateError';
  constructor(options?: string | Omit<DumboErrorOptions, 'status'>) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super({
      ...rest,
      status: IllegalStateError.ErrorCode,
      code: rest.code ?? 'DMB_ERR_ILLEGAL_STATE',
      message: message ?? `Illegal State ocurred during Emmett processing`,
    });
    this.errorType = IllegalStateError.ErrorType;

    // 👇️ because we are extending a built-in class
    Object.setPrototypeOf(this, IllegalStateError.prototype);
  }
}

export class SerializationError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'SerializationError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_SERIALIZATION',
        message:
          message ??
          `A serialization failure occurred. The transaction can be retried.`,
      },
      innerError,
    );
    this.errorType = SerializationError.ErrorType;

    Object.setPrototypeOf(this, SerializationError.prototype);
  }
}

export class DeadlockError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'DeadlockError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_DEADLOCK',
        message:
          message ?? `A deadlock was detected. The transaction can be retried.`,
      },
      innerError,
    );
    this.errorType = DeadlockError.ErrorType;

    Object.setPrototypeOf(this, DeadlockError.prototype);
  }
}

export class LockNotAvailableError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'LockNotAvailableError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_LOCK_NOT_AVAILABLE',
        message: message ?? `The requested lock is not available.`,
      },
      innerError,
    );
    this.errorType = LockNotAvailableError.ErrorType;

    Object.setPrototypeOf(this, LockNotAvailableError.prototype);
  }
}

export class InsufficientResourcesError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'InsufficientResourcesError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_INSUFFICIENT_RESOURCES',
        message:
          message ??
          `Insufficient resources to complete the database operation (e.g. disk full, out of memory, too many connections).`,
      },
      innerError,
    );
    this.errorType = InsufficientResourcesError.ErrorType;

    Object.setPrototypeOf(this, InsufficientResourcesError.prototype);
  }
}

export class SystemError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'SystemError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_SYSTEM',
        message: message ?? `A system-level error occurred (e.g. I/O error).`,
      },
      innerError,
    );
    this.errorType = SystemError.ErrorType;

    Object.setPrototypeOf(this, SystemError.prototype);
  }
}

export class AdminShutdownError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'AdminShutdownError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_ADMIN_SHUTDOWN',
        message:
          message ?? `The database server is shutting down or restarting.`,
      },
      innerError,
    );
    this.errorType = AdminShutdownError.ErrorType;

    Object.setPrototypeOf(this, AdminShutdownError.prototype);
  }
}

export class QueryCanceledError extends TransientDatabaseError {
  static readonly ErrorCode: number = 503;
  static readonly ErrorType: string = 'QueryCanceledError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_QUERY_CANCELED',
        message:
          message ??
          `The query was canceled, e.g. due to statement timeout or user request.`,
      },
      innerError,
    );
    this.errorType = QueryCanceledError.ErrorType;

    Object.setPrototypeOf(this, QueryCanceledError.prototype);
  }
}

export class IntegrityConstraintViolationError extends DumboError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'IntegrityConstraintViolationError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super({
      ...rest,
      cause: rest.cause ?? innerError,
      status: IntegrityConstraintViolationError.ErrorCode,
      code: rest.code ?? 'DMB_ERR_INTEGRITY_CONSTRAINT_VIOLATION',
      message: message ?? `An integrity constraint violation occurred!`,
    });
    this.errorType = IntegrityConstraintViolationError.ErrorType;

    Object.setPrototypeOf(this, IntegrityConstraintViolationError.prototype);
  }
}

export class UniqueConstraintError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'UniqueConstraintError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_UNIQUE_CONSTRAINT',
        message: message ?? `Unique constraint violation occurred!`,
      },
      innerError,
    );
    this.errorType = UniqueConstraintError.ErrorType;

    Object.setPrototypeOf(this, UniqueConstraintError.prototype);
  }
}

export class ForeignKeyViolationError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'ForeignKeyViolationError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_FOREIGN_KEY_VIOLATION',
        message: message ?? `Foreign key constraint violation occurred!`,
      },
      innerError,
    );
    this.errorType = ForeignKeyViolationError.ErrorType;

    Object.setPrototypeOf(this, ForeignKeyViolationError.prototype);
  }
}

export class NotNullViolationError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'NotNullViolationError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_NOT_NULL_VIOLATION',
        message: message ?? `NOT NULL constraint violation occurred!`,
      },
      innerError,
    );
    this.errorType = NotNullViolationError.ErrorType;

    Object.setPrototypeOf(this, NotNullViolationError.prototype);
  }
}

export class CheckViolationError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'CheckViolationError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_CHECK_VIOLATION',
        message: message ?? `CHECK constraint violation occurred!`,
      },
      innerError,
    );
    this.errorType = CheckViolationError.ErrorType;

    Object.setPrototypeOf(this, CheckViolationError.prototype);
  }
}

export class ExclusionViolationError extends IntegrityConstraintViolationError {
  static readonly ErrorCode: number = 409;
  static readonly ErrorType: string = 'ExclusionViolationError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super(
      {
        ...rest,
        code: rest.code ?? 'DMB_ERR_EXCLUSION_VIOLATION',
        message: message ?? `Exclusion constraint violation occurred!`,
      },
      innerError,
    );
    this.errorType = ExclusionViolationError.ErrorType;

    Object.setPrototypeOf(this, ExclusionViolationError.prototype);
  }
}

export class DataError extends DumboError {
  static readonly ErrorCode: number = 400;
  static readonly ErrorType: string = 'DataError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super({
      ...rest,
      cause: rest.cause ?? innerError,
      status: DataError.ErrorCode,
      code: rest.code ?? 'DMB_ERR_DATA',
      message:
        message ?? `A data error occurred (e.g. invalid value, type mismatch).`,
    });
    this.errorType = DataError.ErrorType;

    Object.setPrototypeOf(this, DataError.prototype);
  }
}

export class InvalidOperationError extends DumboError {
  static readonly ErrorCode: number = 400;
  static readonly ErrorType: string = 'InvalidOperationError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super({
      ...rest,
      cause: rest.cause ?? innerError,
      status: InvalidOperationError.ErrorCode,
      code: rest.code ?? 'DMB_ERR_INVALID_OPERATION',
      message:
        message ??
        `Invalid operation (e.g. syntax error, insufficient privileges, undefined table).`,
    });
    this.errorType = InvalidOperationError.ErrorType;

    Object.setPrototypeOf(this, InvalidOperationError.prototype);
  }
}

export class NotRegisteredError extends DumboError {
  static readonly ErrorCode: number = 500;
  static readonly ErrorType: string = 'NotRegisteredError';

  constructor(
    options?: string | Omit<DumboErrorOptions, 'status'>,
    innerError?: Error,
  ) {
    const { message, ...rest } = isString(options)
      ? { message: options }
      : (options ?? {});
    super({
      ...rest,
      cause: rest.cause ?? innerError,
      status: NotRegisteredError.ErrorCode,
      code: rest.code ?? 'DMB_ERR_NOT_REGISTERED',
      message:
        message ??
        `No implementation registered (e.g. missing formatter, plugin or driver import).`,
    });
    this.errorType = NotRegisteredError.ErrorType;

    Object.setPrototypeOf(this, NotRegisteredError.prototype);
  }
}
