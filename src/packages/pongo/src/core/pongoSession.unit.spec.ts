import { DumboError } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import { pongoSession } from './pongoSession';

describe('pongoSession', () => {
  it('rejects committing without an active transaction', async () => {
    const session = pongoSession();

    await assert.rejects(
      () => session.commitTransaction(),
      (error: unknown) => {
        assert.ok(DumboError.isInstanceOf(error));
        assert.strictEqual(error.errorType, 'PongoError');
        assert.strictEqual(error.errorCode, 500);
        assert.strictEqual(error.message, 'No active transaction exists!');
        return true;
      },
    );
  });

  it('rejects aborting without an active transaction', async () => {
    const session = pongoSession();

    await assert.rejects(() => session.abortTransaction(), {
      message: 'No active transaction exists!',
      errorType: 'PongoError',
      errorCode: 500,
    });
  });

  it('rejects starting a transaction while another one is active', () => {
    const session = pongoSession();

    session.startTransaction();

    assert.throws(() => session.startTransaction(), {
      message: 'Active transaction already exists!',
      errorType: 'PongoError',
      errorCode: 500,
    });
  });
});
