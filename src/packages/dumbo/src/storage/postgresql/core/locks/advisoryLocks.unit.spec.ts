import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { SQLExecutor } from '../../../../core';
import { LockNotAvailableError, QueryCanceledError } from '../../../../core';
import { assertRejectsDumboError } from '../../../../core/errors/errorAssertions';
import { acquireAdvisoryLock, tryAcquireAdvisoryLock } from './advisoryLocks';

const executorTimingOut = (): SQLExecutor =>
  ({
    query: () =>
      Promise.reject(
        new QueryCanceledError('canceling statement due to statement timeout'),
      ),
  }) as unknown as SQLExecutor;

describe('acquiring a PostgreSQL advisory lock', () => {
  it('reports the lock as not taken when the query is canceled by the timeout', async () => {
    assert.strictEqual(
      await tryAcquireAdvisoryLock(executorTimingOut(), { lockId: 1234 }),
      false,
    );
  });

  it('fails with a LockNotAvailableError when the lock cannot be acquired in time', () =>
    assertRejectsDumboError(
      () => acquireAdvisoryLock(executorTimingOut(), { lockId: 1234 }),
      {
        errorType: LockNotAvailableError.ErrorType,
        errorCode: 503,
        message:
          'Failed to acquire advisory lock within the specified timeout. Migration aborted.',
      },
    ));
});
