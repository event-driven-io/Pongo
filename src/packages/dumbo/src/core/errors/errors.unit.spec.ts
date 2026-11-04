import assert from 'assert';
import { describe, expectTypeOf, it } from 'vitest';
import { BatchCommandNoChangesError } from '../execute';
import {
  AdminShutdownError,
  CheckViolationError,
  ConcurrencyError,
  ConnectionError,
  DataError,
  DeadlockError,
  DumboError,
  DumboErrorTypeId,
  ExclusionViolationError,
  ForeignKeyViolationError,
  IllegalStateError,
  InsufficientResourcesError,
  IntegrityConstraintViolationError,
  InvalidOperationError,
  LockNotAvailableError,
  NotNullViolationError,
  NotRegisteredError,
  QueryCanceledError,
  SerializationError,
  SystemError,
  TransientDatabaseError,
  UniqueConstraintError,
  type DumboErrorOptions,
} from './index';

type BuiltInErrorOptions = string | Omit<DumboErrorOptions, 'status'>;

const errorCases: {
  errorType: string;
  errorCode: number;
  code: string;
  create: (options?: BuiltInErrorOptions, innerError?: Error) => DumboError;
}[] = [
  {
    errorType: 'ConcurrencyError',
    errorCode: 412,
    code: 'DMB_ERR_CONCURRENCY',
    create: (options, innerError) => new ConcurrencyError(options, innerError),
  },
  {
    errorType: 'TransientDatabaseError',
    errorCode: 503,
    code: 'DMB_ERR_TRANSIENT_DATABASE',
    create: (options, innerError) =>
      new TransientDatabaseError(options, innerError),
  },
  {
    errorType: 'ConnectionError',
    errorCode: 503,
    code: 'DMB_ERR_CONNECTION',
    create: (options, innerError) => new ConnectionError(options, innerError),
  },
  {
    errorType: 'SerializationError',
    errorCode: 503,
    code: 'DMB_ERR_SERIALIZATION',
    create: (options, innerError) =>
      new SerializationError(options, innerError),
  },
  {
    errorType: 'DeadlockError',
    errorCode: 503,
    code: 'DMB_ERR_DEADLOCK',
    create: (options, innerError) => new DeadlockError(options, innerError),
  },
  {
    errorType: 'LockNotAvailableError',
    errorCode: 503,
    code: 'DMB_ERR_LOCK_NOT_AVAILABLE',
    create: (options, innerError) =>
      new LockNotAvailableError(options, innerError),
  },
  {
    errorType: 'InsufficientResourcesError',
    errorCode: 503,
    code: 'DMB_ERR_INSUFFICIENT_RESOURCES',
    create: (options, innerError) =>
      new InsufficientResourcesError(options, innerError),
  },
  {
    errorType: 'SystemError',
    errorCode: 503,
    code: 'DMB_ERR_SYSTEM',
    create: (options, innerError) => new SystemError(options, innerError),
  },
  {
    errorType: 'AdminShutdownError',
    errorCode: 503,
    code: 'DMB_ERR_ADMIN_SHUTDOWN',
    create: (options, innerError) =>
      new AdminShutdownError(options, innerError),
  },
  {
    errorType: 'QueryCanceledError',
    errorCode: 503,
    code: 'DMB_ERR_QUERY_CANCELED',
    create: (options, innerError) =>
      new QueryCanceledError(options, innerError),
  },
  {
    errorType: 'IntegrityConstraintViolationError',
    errorCode: 409,
    code: 'DMB_ERR_INTEGRITY_CONSTRAINT_VIOLATION',
    create: (options, innerError) =>
      new IntegrityConstraintViolationError(options, innerError),
  },
  {
    errorType: 'UniqueConstraintError',
    errorCode: 409,
    code: 'DMB_ERR_UNIQUE_CONSTRAINT',
    create: (options, innerError) =>
      new UniqueConstraintError(options, innerError),
  },
  {
    errorType: 'ForeignKeyViolationError',
    errorCode: 409,
    code: 'DMB_ERR_FOREIGN_KEY_VIOLATION',
    create: (options, innerError) =>
      new ForeignKeyViolationError(options, innerError),
  },
  {
    errorType: 'NotNullViolationError',
    errorCode: 409,
    code: 'DMB_ERR_NOT_NULL_VIOLATION',
    create: (options, innerError) =>
      new NotNullViolationError(options, innerError),
  },
  {
    errorType: 'CheckViolationError',
    errorCode: 409,
    code: 'DMB_ERR_CHECK_VIOLATION',
    create: (options, innerError) =>
      new CheckViolationError(options, innerError),
  },
  {
    errorType: 'ExclusionViolationError',
    errorCode: 409,
    code: 'DMB_ERR_EXCLUSION_VIOLATION',
    create: (options, innerError) =>
      new ExclusionViolationError(options, innerError),
  },
  {
    errorType: 'DataError',
    errorCode: 400,
    code: 'DMB_ERR_DATA',
    create: (options, innerError) => new DataError(options, innerError),
  },
  {
    errorType: 'InvalidOperationError',
    errorCode: 400,
    code: 'DMB_ERR_INVALID_OPERATION',
    create: (options, innerError) =>
      new InvalidOperationError(options, innerError),
  },
  {
    errorType: 'NotRegisteredError',
    errorCode: 500,
    code: 'DMB_ERR_NOT_REGISTERED',
    create: (options, innerError) =>
      new NotRegisteredError(options, innerError),
  },
  {
    errorType: 'BatchCommandNoChangesError',
    errorCode: 409,
    code: 'DMB_ERR_BATCH_COMMAND_NO_CHANGES',
    create: (options) => new BatchCommandNoChangesError(0, options),
  },
];

const errorCasesWithInnerErrorArgument = errorCases.filter(
  ({ errorType }) => errorType !== BatchCommandNoChangesError.ErrorType,
);

describe('Database errors', () => {
  for (const { errorType, errorCode, code, create } of errorCases) {
    describe(errorType, () => {
      it(`is identified by the "${errorType}" error type`, () => {
        assert.strictEqual(create().errorType, errorType);
      });

      it(`responds with the ${errorCode} status code`, () => {
        assert.strictEqual(create().errorCode, errorCode);
      });

      it(`responds with the ${errorCode} status`, () => {
        assert.strictEqual(create().status, errorCode);
      });

      it(`has the "${code}" code by default`, () => {
        assert.strictEqual(create().code, code);
        assert.strictEqual(create('Something failed').code, code);
        assert.strictEqual(create({ message: 'Something failed' }).code, code);
      });

      it('keeps the code passed in options instead of the default one', () => {
        assert.strictEqual(
          create({ code: 'ORDER_FAILED' }).code,
          'ORDER_FAILED',
        );
      });

      it('carries message, code, cause and details from options', () => {
        const cause = new Error('Original failure');

        const error = create({
          message: 'Order failed',
          code: 'ORDER_FAILED',
          cause,
          details: { orderId: 'order-1' },
        });

        assert.strictEqual(error.message, 'Order failed');
        assert.strictEqual(error.code, 'ORDER_FAILED');
        assert.strictEqual(error.cause, cause);
        assert.strictEqual(error.innerError, cause);
        assert.deepStrictEqual(error.details, { orderId: 'order-1' });
        assert.strictEqual(error.errorType, errorType);
        assert.strictEqual(error.status, errorCode);
      });

      it('accepts a message as the first argument', () => {
        assert.strictEqual(
          create('Something failed').message,
          'Something failed',
        );
      });

      it('carries the Dumbo error type id', () => {
        assert.ok(DumboErrorTypeId in create());
      });

      it('is matched by isInstanceOf with its status, code, errorCode and errorType', () => {
        assert.ok(
          DumboError.isInstanceOf(create(), {
            status: errorCode,
            code,
            errorCode,
            errorType,
          }),
        );
      });
    });
  }

  for (const { errorType, create } of errorCasesWithInnerErrorArgument) {
    it(`${errorType} keeps the current message and innerError arguments`, () => {
      const innerError = new Error('Original failure');

      const error = create('Something failed', innerError);

      assert.strictEqual(error.message, 'Something failed');
      assert.strictEqual(error.innerError, innerError);
      assert.strictEqual(error.cause, innerError);
    });

    it(`${errorType} keeps its default message when only innerError is passed`, () => {
      const innerError = new Error('Original failure');

      const error = create(undefined, innerError);

      assert.strictEqual(error.message, create().message);
      assert.strictEqual(error.cause, innerError);
    });
  }

  it('never falls back to the generic DumboError type', () => {
    for (const { create } of errorCases)
      assert.notStrictEqual(create().errorType, DumboError.ErrorType);
  });

  it('assigns a unique error type to every error', () => {
    const types = errorCases.map(({ create }) => create().errorType);

    assert.strictEqual(new Set(types).size, types.length);
  });

  it('assigns a unique code to every error', () => {
    const codes = errorCases.map(({ create }) => create().code);

    assert.strictEqual(new Set(codes).size, codes.length);
  });

  it('accept a message or code, cause and details in built-in error options', () => {
    type Options = ConstructorParameters<typeof UniqueConstraintError>[0];

    expectTypeOf<string>().toExtend<Options>();
    expectTypeOf<{
      message?: string;
      code?: string;
      cause?: unknown;
      details?: Record<string, unknown>;
    }>().toExtend<Options>();
    expectTypeOf<{ status: number }>().not.toExtend<Options>();
    expectTypeOf<{ code: number }>().not.toExtend<Options>();

    expectTypeOf<
      ConstructorParameters<typeof UniqueConstraintError>[1]
    >().toEqualTypeOf<Error | undefined>();
  });
});

describe('DumboError', () => {
  it('carries status, message, code and details from options', () => {
    const error = new DumboError({
      status: 409,
      message: 'Order already exists',
      code: 'ORDER_ALREADY_EXISTS',
      details: { orderId: 'order-1' },
    });

    assert.strictEqual(error.status, 409);
    assert.strictEqual(error.message, 'Order already exists');
    assert.strictEqual(error.code, 'ORDER_ALREADY_EXISTS');
    assert.deepStrictEqual(error.details, { orderId: 'order-1' });
  });

  it('uses a default message with the status when message is not provided', () => {
    const error = new DumboError({ status: 409 });

    assert.strictEqual(
      error.message,
      `Error with status code '409' ocurred during DumboError processing`,
    );
    assert.strictEqual(error.details, undefined);
  });

  it('exposes cause as the native error cause', () => {
    const cause = new Error('Connection lost');

    const error = new DumboError({ status: 503, cause });

    assert.strictEqual(error.cause, cause);
    assert.ok(Object.prototype.hasOwnProperty.call(error, 'cause'));
  });

  it('returns cause from the deprecated innerError', () => {
    const cause = new Error('Connection lost');

    const error = new DumboError({ status: 503, cause });

    assert.strictEqual(error.innerError, cause);
  });

  it('returns status from the deprecated errorCode', () => {
    const error = new DumboError({ status: 404 });

    assert.strictEqual(error.errorCode, 404);
  });

  it('keeps the deprecated errorCode and errorType when the error is copied', () => {
    const error = new DumboError({ status: 404 });

    assert.strictEqual({ ...error }.errorCode, 404);
    assert.strictEqual({ ...error }.errorType, 'DumboError');
  });

  it('uses the DumboError error type with options', () => {
    const error = new DumboError({ status: 409 });

    assert.strictEqual(error.errorType, 'DumboError');
  });

  it('still accepts errorCode, errorType, message and innerError in options', () => {
    const innerError = new Error('Original failure');

    const error = new DumboError({
      errorCode: 402,
      errorType: 'PaymentRequiredError',
      message: 'Pay first',
      innerError,
    });

    assert.strictEqual(error.status, 402);
    assert.strictEqual(error.errorCode, 402);
    assert.strictEqual(error.errorType, 'PaymentRequiredError');
    assert.strictEqual(error.message, 'Pay first');
    assert.strictEqual(error.innerError, innerError);
    assert.strictEqual(error.cause, innerError);
  });

  it('still uses the DumboError error type when errorType is not in options', () => {
    const error = new DumboError({ errorCode: 402 });

    assert.strictEqual(error.errorType, 'DumboError');
  });

  it('still accepts a number as status', () => {
    const error = new DumboError(404);

    assert.strictEqual(error.status, 404);
    assert.strictEqual(error.errorCode, 404);
    assert.strictEqual(
      error.message,
      `Error with status code '404' ocurred during DumboError processing`,
    );
  });

  it('still accepts a string as message', () => {
    const error = new DumboError('Something failed');

    assert.strictEqual(error.status, 500);
    assert.strictEqual(error.message, 'Something failed');
  });

  it('uses internal server error status without options', () => {
    const error = new DumboError();

    assert.strictEqual(error.status, 500);
    assert.strictEqual(error.errorCode, 500);
  });

  it('uses the internal code for every status and constructor form when code is not provided', () => {
    assert.strictEqual(
      new DumboError({ status: 409 }).code,
      'DMB_ERR_INTERNAL',
    );
    assert.strictEqual(
      new DumboError({ status: 500 }).code,
      'DMB_ERR_INTERNAL',
    );
    assert.strictEqual(
      new DumboError({ errorCode: 412, message: 'Changed' }).code,
      'DMB_ERR_INTERNAL',
    );
    assert.strictEqual(new DumboError(404).code, 'DMB_ERR_INTERNAL');
    assert.strictEqual(
      new DumboError('Something failed').code,
      'DMB_ERR_INTERNAL',
    );
    assert.strictEqual(new DumboError().code, 'DMB_ERR_INTERNAL');
  });

  it('keeps the code passed in options instead of the default one', () => {
    const error = new DumboError({ status: 404, code: 'ORDER_NOT_FOUND' });

    assert.strictEqual(error.code, 'ORDER_NOT_FOUND');
  });

  it('carries the Dumbo error type id for every constructor form', () => {
    assert.ok(DumboErrorTypeId in new DumboError({ status: 409 }));
    assert.ok(DumboErrorTypeId in new DumboError({ errorCode: 409 }));
    assert.ok(DumboErrorTypeId in new DumboError(409));
    assert.ok(DumboErrorTypeId in new DumboError('Something failed'));
    assert.ok(DumboErrorTypeId in new DumboError());
  });

  it('uses the shared Dumbo error type id symbol', () => {
    assert.strictEqual(
      DumboErrorTypeId,
      Symbol.for('@event-driven-io/dumbo/DumboError'),
    );
  });

  it('does not expose the type id as an enumerable property', () => {
    const error = new DumboError();

    assert.ok(
      !Object.prototype.propertyIsEnumerable.call(error, DumboErrorTypeId),
    );
    assert.ok(!(DumboErrorTypeId in { ...error }));
  });

  it('accepts only the documented options shape', () => {
    type Options = Exclude<
      ConstructorParameters<typeof DumboError>[0],
      undefined | string | number
    >;

    expectTypeOf<{
      status: number;
      message?: string;
      code?: string;
      cause?: unknown;
      details?: Record<string, unknown>;
    }>().toExtend<Options>();
    expectTypeOf<{
      errorCode: number;
      errorType?: string;
      message?: string;
      innerError?: Error;
    }>().toExtend<Options>();

    expectTypeOf<{ status: string }>().not.toExtend<Options>();
    expectTypeOf<{ status: number; code: number }>().not.toExtend<Options>();
    expectTypeOf<{ status: number; details: string }>().not.toExtend<Options>();
    expectTypeOf<{ message: string }>().not.toExtend<Options>();

    expectTypeOf<DumboError['status']>().toEqualTypeOf<number>();
    expectTypeOf<DumboError['code']>().toEqualTypeOf<string>();
    expectTypeOf<DumboError['details']>().toEqualTypeOf<
      Record<string, unknown> | undefined
    >();
    expectTypeOf<DumboError['errorCode']>().toEqualTypeOf<number>();
    expectTypeOf<DumboError['errorType']>().toEqualTypeOf<string>();
    expectTypeOf<DumboError['innerError']>().toEqualTypeOf<Error | undefined>();
  });
});

describe('IllegalStateError', () => {
  it('responds with the 403 status and the illegal state code', () => {
    const error = new IllegalStateError();

    assert.strictEqual(error.status, 403);
    assert.strictEqual(error.errorCode, 403);
    assert.strictEqual(error.code, 'DMB_ERR_ILLEGAL_STATE');
  });

  it('is identified by the "IllegalStateError" error type', () => {
    assert.strictEqual(new IllegalStateError().errorType, 'IllegalStateError');
    assert.strictEqual(
      new IllegalStateError().errorType,
      IllegalStateError.ErrorType,
    );
  });

  it('keeps its default message', () => {
    assert.strictEqual(
      new IllegalStateError().message,
      'Illegal State ocurred during Emmett processing',
    );
  });

  it('keeps the current message argument', () => {
    const error = new IllegalStateError('Already started');

    assert.strictEqual(error.message, 'Already started');
    assert.strictEqual(error.code, 'DMB_ERR_ILLEGAL_STATE');
  });

  it('carries message, code, cause and details from options', () => {
    const cause = new Error('Original failure');

    const error = new IllegalStateError({
      message: 'Already started',
      code: 'PROCESSOR_ALREADY_STARTED',
      cause,
      details: { processorId: 'processor-1' },
    });

    assert.strictEqual(error.message, 'Already started');
    assert.strictEqual(error.code, 'PROCESSOR_ALREADY_STARTED');
    assert.strictEqual(error.cause, cause);
    assert.strictEqual(error.innerError, cause);
    assert.deepStrictEqual(error.details, { processorId: 'processor-1' });
  });

  it('carries the Dumbo error type id', () => {
    assert.ok(DumboErrorTypeId in new IllegalStateError());
  });
});

describe('BatchCommandNoChangesError options', () => {
  it('keeps the statement index and default message with options', () => {
    const error = new BatchCommandNoChangesError(3, {
      code: 'ORDER_NOT_UPDATED',
      details: { orderId: 'order-1' },
    });

    assert.strictEqual(error.statementIndex, 3);
    assert.strictEqual(
      error.message,
      'Batch command at index 3 affected no rows',
    );
    assert.strictEqual(error.code, 'ORDER_NOT_UPDATED');
    assert.deepStrictEqual(error.details, { orderId: 'order-1' });
  });

  it('keeps the current statement index argument', () => {
    const error = new BatchCommandNoChangesError(3);

    assert.strictEqual(error.statementIndex, 3);
    assert.strictEqual(error.name, 'BatchCommandNoChangesError');
    assert.strictEqual(
      error.message,
      'Batch command at index 3 affected no rows',
    );
  });

  it('accepts a message or code, cause and details as the second argument', () => {
    type Options = ConstructorParameters<typeof BatchCommandNoChangesError>[1];

    expectTypeOf<string | undefined>().toExtend<Options>();
    expectTypeOf<{
      message?: string;
      code?: string;
      cause?: unknown;
      details?: Record<string, unknown>;
    }>().toExtend<Options>();
    expectTypeOf<{ status: number }>().not.toExtend<Options>();
  });
});

describe('DumboError.isInstanceOf', () => {
  it('matches Dumbo errors', () => {
    assert.ok(DumboError.isInstanceOf(new DumboError()));
    assert.ok(DumboError.isInstanceOf(new UniqueConstraintError()));
    assert.ok(DumboError.isInstanceOf(new IllegalStateError()));
  });

  it('matches an error from another copy of Dumbo', () => {
    const error = Object.assign(new Error('Conflict'), {
      status: 409,
      code: 'DMB_ERR_UNIQUE_CONSTRAINT',
      errorCode: 409,
      errorType: 'UniqueConstraintError',
      [Symbol.for('@event-driven-io/dumbo/DumboError')]: true,
    });

    assert.ok(
      DumboError.isInstanceOf(error, {
        status: 409,
        code: 'DMB_ERR_UNIQUE_CONSTRAINT',
        errorCode: 409,
        errorType: 'UniqueConstraintError',
      }),
    );
  });

  it('does not match values without the Dumbo error type id', () => {
    assert.ok(!DumboError.isInstanceOf(new Error('Plain')));
    assert.ok(
      !DumboError.isInstanceOf({ errorCode: 409, errorType: 'DumboError' }),
    );
    assert.ok(!DumboError.isInstanceOf({ ...new DumboError() }));
    assert.ok(!DumboError.isInstanceOf(null));
    assert.ok(!DumboError.isInstanceOf('error'));
  });

  it('matches by status', () => {
    const error = new UniqueConstraintError();

    assert.ok(DumboError.isInstanceOf(error, { status: 409 }));
    assert.ok(!DumboError.isInstanceOf(error, { status: 412 }));
  });

  it('matches by code', () => {
    const error = new UniqueConstraintError();

    assert.ok(
      DumboError.isInstanceOf(error, { code: 'DMB_ERR_UNIQUE_CONSTRAINT' }),
    );
    assert.ok(!DumboError.isInstanceOf(error, { code: 'DMB_ERR_INTERNAL' }));
  });

  it('matches by errorCode', () => {
    const error = new UniqueConstraintError();

    assert.ok(DumboError.isInstanceOf(error, { errorCode: 409 }));
    assert.ok(!DumboError.isInstanceOf(error, { errorCode: 412 }));
  });

  it('matches by errorType', () => {
    const error = new UniqueConstraintError();

    assert.ok(
      DumboError.isInstanceOf(error, {
        errorType: UniqueConstraintError.ErrorType,
      }),
    );
    assert.ok(
      !DumboError.isInstanceOf(error, {
        errorType: ConcurrencyError.ErrorType,
      }),
    );
  });

  it('matches only when every given field matches', () => {
    const error = new UniqueConstraintError();

    assert.ok(
      DumboError.isInstanceOf(error, {
        status: 409,
        code: 'DMB_ERR_UNIQUE_CONSTRAINT',
      }),
    );
    assert.ok(
      !DumboError.isInstanceOf(error, {
        status: 409,
        code: 'DMB_ERR_INTERNAL',
      }),
    );
  });

  it('accepts status, code, errorCode and errorType filters', () => {
    type Filter = Parameters<typeof DumboError.isInstanceOf>[1];

    expectTypeOf<{
      status?: number;
      code?: string;
      errorCode?: number;
      errorType?: string;
    }>().toExtend<Filter>();
    expectTypeOf<{ status: string }>().not.toExtend<Filter>();
    expectTypeOf<{ code: number }>().not.toExtend<Filter>();
  });
});
