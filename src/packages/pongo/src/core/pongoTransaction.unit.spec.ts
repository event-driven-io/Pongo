import { DumboError } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import { pongoTransaction } from './pongoTransaction';

const assertPongoError = (error: unknown, message: string): void => {
  assert.ok(DumboError.isInstanceOf(error));
  assert.strictEqual(error.errorType, 'PongoError');
  assert.strictEqual(error.errorCode, 500);
  assert.strictEqual(error.message, message);
};

describe('pongoTransaction', () => {
  it('rejects committing after rollback', async () => {
    const transaction = pongoTransaction({
      get snapshotEnabled() {
        return false;
      },
    });

    await transaction.rollback();

    await assert.rejects(
      () => transaction.commit(),
      (error: unknown) => {
        assertPongoError(error, 'Transaction is not active!');
        return true;
      },
    );
  });

  it('rejects rolling back after commit', async () => {
    const transaction = pongoTransaction({
      get snapshotEnabled() {
        return false;
      },
    });

    await transaction.commit();

    await assert.rejects(
      () => transaction.rollback(),
      (error: unknown) => {
        assertPongoError(error, 'Cannot rollback commited transaction!');
        return true;
      },
    );
  });

  it('rejects using a SQL executor before a database transaction starts', () => {
    const transaction = pongoTransaction({
      get snapshotEnabled() {
        return false;
      },
    });

    assert.throws(
      () => transaction.sqlExecutor,
      (error: unknown) => {
        assertPongoError(error, 'No database transaction was started');
        return true;
      },
    );
  });
});
