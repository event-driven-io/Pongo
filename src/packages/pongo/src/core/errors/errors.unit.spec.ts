import {
  ConcurrencyError as DumboConcurrencyError,
  DumboError,
} from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import { ConcurrencyError, NotImplementedError, PongoError } from './index';

const errorCases: {
  errorType: string;
  errorCode: number;
  create: () => PongoError;
}[] = [
  { errorType: 'PongoError', errorCode: 500, create: () => new PongoError() },
  {
    errorType: 'NotImplementedError',
    errorCode: 501,
    create: () => new NotImplementedError(),
  },
];

describe('Pongo errors', () => {
  for (const { errorType, errorCode, create } of errorCases) {
    describe(errorType, () => {
      it(`is identified by the "${errorType}" error type`, () => {
        assert.strictEqual(create().errorType, errorType);
      });

      it(`responds with the ${errorCode} status code`, () => {
        assert.strictEqual(create().errorCode, errorCode);
      });

      it('is a DumboError', () => {
        const error = create();

        assert.ok(error instanceof DumboError);
        assert.ok(DumboError.isInstanceOf(error));
      });
    });
  }

  it('assigns a unique error type to every error', () => {
    const types = errorCases.map(({ create }) => create().errorType);

    assert.strictEqual(new Set(types).size, types.length);
  });

  describe('PongoError construction', () => {
    it('uses the passed message', () => {
      assert.strictEqual(new PongoError('Boom!').message, 'Boom!');
    });

    it('uses the passed error code', () => {
      assert.strictEqual(new PongoError(404).errorCode, 404);
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
  });

  describe('NotImplementedError', () => {
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
