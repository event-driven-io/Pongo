import {
  ConcurrencyError as DumboConcurrencyError,
  DumboError,
  DumboErrorTypeId,
} from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, expectTypeOf, it } from 'vitest';
import { ConcurrencyError, NotImplementedError, PongoError } from './index';

const errorCases: {
  errorType: string;
  errorCode: number;
  code: string;
  create: () => PongoError;
}[] = [
  {
    errorType: 'PongoError',
    errorCode: 500,
    code: 'PNG_ERR_INTERNAL',
    create: () => new PongoError(),
  },
  {
    errorType: 'NotImplementedError',
    errorCode: 501,
    code: 'PNG_ERR_NOT_IMPLEMENTED',
    create: () => new NotImplementedError(),
  },
];

describe('Pongo errors', () => {
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
      });

      it('is a DumboError', () => {
        const error = create();

        assert.ok(error instanceof DumboError);
        assert.ok(DumboError.isInstanceOf(error));
      });

      it('is a PongoError and an Error', () => {
        const error = create();

        assert.ok(error instanceof PongoError);
        assert.ok(error instanceof Error);
      });

      it('has no cause, innerError or details by default', () => {
        const error = create();

        assert.strictEqual(error.cause, undefined);
        assert.strictEqual(error.innerError, undefined);
        assert.strictEqual(error.details, undefined);
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

  it('assigns a unique error type to every error', () => {
    const types = errorCases.map(({ create }) => create().errorType);

    assert.strictEqual(new Set(types).size, types.length);
  });

  it('assigns a unique code to every error', () => {
    const codes = errorCases.map(({ create }) => create().code);

    assert.strictEqual(new Set(codes).size, codes.length);
  });

  describe('PongoError construction', () => {
    it('uses the passed message', () => {
      assert.strictEqual(new PongoError('Boom!').message, 'Boom!');
    });

    it('uses the 500 status, the PongoError error type and the internal Pongo code with a message', () => {
      const error = new PongoError('Boom!');

      assert.strictEqual(error.status, 500);
      assert.strictEqual(error.errorCode, 500);
      assert.strictEqual(error.errorType, 'PongoError');
      assert.strictEqual(error.code, 'PNG_ERR_INTERNAL');
    });

    it('uses the passed error code', () => {
      assert.strictEqual(new PongoError(404).errorCode, 404);
    });

    it('uses the Pongo processing message and the PongoError error type with a status number', () => {
      const error = new PongoError(404);

      assert.strictEqual(error.status, 404);
      assert.strictEqual(
        error.message,
        `Error with status code '404' ocurred during Pongo processing`,
      );
      assert.strictEqual(error.errorType, 'PongoError');
    });

    it('uses the Pongo processing message with the errorCode when message is not provided', () => {
      assert.strictEqual(
        new PongoError({ errorCode: 402 }).message,
        `Error with status code '402' ocurred during Pongo processing`,
      );
    });

    it('uses the internal Pongo code when code is undefined', () => {
      assert.strictEqual(
        new PongoError({ status: 409, code: undefined }).code,
        'PNG_ERR_INTERNAL',
      );
    });

    it('uses the passed error code and message', () => {
      const error = new PongoError({ errorCode: 404, message: 'Not found!' });

      assert.strictEqual(error.errorCode, 404);
      assert.strictEqual(error.message, 'Not found!');
    });

    it('falls back to the Pongo processing message', () => {
      assert.strictEqual(
        new PongoError().message,
        `Error with status code '500' ocurred during Pongo processing`,
      );
    });

    it('keeps the inner error', () => {
      const innerError = new Error('Inner!');
      const error = new PongoError({ errorCode: 500, innerError });

      assert.strictEqual(error.innerError, innerError);
      assert.strictEqual(error.cause, innerError);
    });

    it('carries status, message, code, cause and details from options', () => {
      const cause = new Error('Original failure');

      const error = new PongoError({
        status: 409,
        message: 'Collection already exists',
        code: 'COLLECTION_ALREADY_EXISTS',
        cause,
        details: { collectionName: 'users' },
      });

      assert.strictEqual(error.status, 409);
      assert.strictEqual(error.errorCode, 409);
      assert.strictEqual(error.message, 'Collection already exists');
      assert.strictEqual(error.code, 'COLLECTION_ALREADY_EXISTS');
      assert.strictEqual(error.cause, cause);
      assert.strictEqual(error.innerError, cause);
      assert.deepStrictEqual(error.details, { collectionName: 'users' });
    });

    it('uses the Pongo processing message with the status when message is not provided', () => {
      const error = new PongoError({ status: 409 });

      assert.strictEqual(
        error.message,
        `Error with status code '409' ocurred during Pongo processing`,
      );
      assert.strictEqual(error.details, undefined);
    });

    it('uses the PongoError error type with options', () => {
      assert.strictEqual(
        new PongoError({ status: 409 }).errorType,
        'PongoError',
      );
    });

    it('still accepts errorCode, errorType, message and innerError in options', () => {
      const innerError = new Error('Original failure');

      const error = new PongoError({
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

    it('still uses the PongoError error type when errorType is not in options', () => {
      assert.strictEqual(
        new PongoError({ errorCode: 402 }).errorType,
        'PongoError',
      );
    });

    it('uses the internal Pongo code for every status and constructor form when code is not provided', () => {
      assert.strictEqual(
        new PongoError({ status: 409 }).code,
        'PNG_ERR_INTERNAL',
      );
      assert.strictEqual(
        new PongoError({ errorCode: 412, message: 'Changed' }).code,
        'PNG_ERR_INTERNAL',
      );
      assert.strictEqual(new PongoError(404).code, 'PNG_ERR_INTERNAL');
      assert.strictEqual(
        new PongoError('Something failed').code,
        'PNG_ERR_INTERNAL',
      );
      assert.strictEqual(new PongoError().code, 'PNG_ERR_INTERNAL');
    });

    it('keeps the code passed in options instead of the default one', () => {
      const error = new PongoError({ status: 404, code: 'USER_NOT_FOUND' });

      assert.strictEqual(error.code, 'USER_NOT_FOUND');
    });

    it('carries the Dumbo error type id for every constructor form', () => {
      assert.ok(DumboErrorTypeId in new PongoError({ status: 409 }));
      assert.ok(DumboErrorTypeId in new PongoError({ errorCode: 409 }));
      assert.ok(DumboErrorTypeId in new PongoError(409));
      assert.ok(DumboErrorTypeId in new PongoError('Something failed'));
      assert.ok(DumboErrorTypeId in new PongoError());
    });

    it('accepts the same options shape as DumboError', () => {
      type Options = Exclude<
        ConstructorParameters<typeof PongoError>[0],
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
      expectTypeOf<{
        status: number;
        details: string;
      }>().not.toExtend<Options>();
      expectTypeOf<{ message: string }>().not.toExtend<Options>();

      expectTypeOf<ConstructorParameters<typeof PongoError>[0]>().toEqualTypeOf<
        ConstructorParameters<typeof DumboError>[0]
      >();
    });
  });

  describe('NotImplementedError', () => {
    it('is a NotImplementedError', () => {
      assert.ok(new NotImplementedError() instanceof NotImplementedError);
    });

    it('defaults to the not implemented message', () => {
      assert.strictEqual(
        new NotImplementedError().message,
        'Method not implemented.',
      );
    });

    it('uses the passed message', () => {
      assert.strictEqual(
        new NotImplementedError('No $text support.').message,
        'No $text support.',
      );
    });

    it('carries message, code, cause and details from options', () => {
      const cause = new Error('Original failure');

      const error = new NotImplementedError({
        message: 'No $text support.',
        code: 'TEXT_SEARCH_NOT_SUPPORTED',
        cause,
        details: { operator: '$text' },
      });

      assert.strictEqual(error.message, 'No $text support.');
      assert.strictEqual(error.code, 'TEXT_SEARCH_NOT_SUPPORTED');
      assert.strictEqual(error.cause, cause);
      assert.strictEqual(error.innerError, cause);
      assert.deepStrictEqual(error.details, { operator: '$text' });
      assert.strictEqual(error.errorType, 'NotImplementedError');
      assert.strictEqual(error.status, 501);
    });

    it('has the not implemented code with a message or options without code', () => {
      assert.strictEqual(
        new NotImplementedError('No $text support.').code,
        'PNG_ERR_NOT_IMPLEMENTED',
      );
      assert.strictEqual(
        new NotImplementedError({ message: 'No $text support.' }).code,
        'PNG_ERR_NOT_IMPLEMENTED',
      );
    });

    it('keeps the code passed in options instead of the default one', () => {
      assert.strictEqual(
        new NotImplementedError({ code: 'TEXT_SEARCH_NOT_SUPPORTED' }).code,
        'TEXT_SEARCH_NOT_SUPPORTED',
      );
    });

    it('defaults to the not implemented message with options without message', () => {
      assert.strictEqual(
        new NotImplementedError({ code: 'TEXT_SEARCH_NOT_SUPPORTED' }).message,
        'Method not implemented.',
      );
    });

    it('keeps the current message and innerError arguments', () => {
      const innerError = new Error('Original failure');

      const error = new NotImplementedError('No $text support.', innerError);

      assert.strictEqual(error.message, 'No $text support.');
      assert.strictEqual(error.innerError, innerError);
      assert.strictEqual(error.cause, innerError);
    });

    it('keeps its default message when only innerError is passed', () => {
      const innerError = new Error('Original failure');

      const error = new NotImplementedError(undefined, innerError);

      assert.strictEqual(error.message, 'Method not implemented.');
      assert.strictEqual(error.cause, innerError);
    });

    it('accepts a message or code, cause and details as the first argument', () => {
      type Options = ConstructorParameters<typeof NotImplementedError>[0];

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
        ConstructorParameters<typeof NotImplementedError>[1]
      >().toEqualTypeOf<Error | undefined>();
    });
  });

  describe('ConcurrencyError', () => {
    it('is re-exported from Dumbo', () => {
      const error = new ConcurrencyError();

      assert.strictEqual(ConcurrencyError, DumboConcurrencyError);
      assert.strictEqual(error.errorType, 'ConcurrencyError');
      assert.strictEqual(error.errorCode, 412);
      assert.ok(error instanceof DumboError);
    });
  });
});
