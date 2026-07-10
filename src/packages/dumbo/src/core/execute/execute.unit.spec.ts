import assert from 'assert';
import { describe, it } from 'vitest';
import { DumboError } from '../errors';
import { BatchCommandNoChangesError } from './execute';

describe('BatchCommandNoChangesError', () => {
  it('signals a conflict with the 409 status code', () => {
    assert.strictEqual(new BatchCommandNoChangesError(0).errorCode, 409);
  });

  it('reports the index of the batch statement that affected no rows', () => {
    assert.strictEqual(new BatchCommandNoChangesError(3).statementIndex, 3);
  });

  it('has a dedicated error type instead of the generic DumboError type', () => {
    assert.strictEqual(
      new BatchCommandNoChangesError(0).errorType,
      'BatchCommandNoChangesError',
    );
  });

  it('is distinguishable from an arbitrary failure wrapped as a generic DumboError', () => {
    const noChanges = new BatchCommandNoChangesError(0);
    const wrappedFailure = new DumboError({ errorCode: 500, message: 'boom' });

    assert.notStrictEqual(noChanges.errorType, wrappedFailure.errorType);
  });
});
