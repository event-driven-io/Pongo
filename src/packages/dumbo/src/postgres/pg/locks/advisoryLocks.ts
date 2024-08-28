import { single, sql, type SQLExecutor } from '../../../core';
import {
  defaultDatabaseLockOptions,
  type DatabaseLock,
  type DatabaseLockOptions,
} from '../../core';

export const tryAcquireAdvisoryLock = async (
  execute: SQLExecutor,
  options: DatabaseLockOptions,
): Promise<boolean> => {
  const timeoutMs = options.timeoutMs ?? defaultDatabaseLockOptions.timeoutMs;

  try {
    await single(
      execute.query<{ locked: boolean }>(
        sql('SELECT pg_advisory_lock(%s) AS locked', options.lockId),
        { timeoutMs },
      ),
    );
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '57014')
      return false;

    throw error;
  }
};

export const releaseAdvisoryLock = async (
  execute: SQLExecutor,
  options: DatabaseLockOptions,
): Promise<boolean> => {
  const timeoutMs = options.timeoutMs ?? defaultDatabaseLockOptions.timeoutMs;

  try {
    await single(
      execute.query<{ locked: boolean }>(
        sql('SELECT pg_advisory_unlock(%s) AS locked', options.lockId),
        { timeoutMs },
      ),
    );
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '57014')
      return false;

    throw error;
  }
};

export const acquireAdvisoryLock = async (
  execute: SQLExecutor,
  options: DatabaseLockOptions,
) => {
  const lockAcquired = await tryAcquireAdvisoryLock(execute, options);
  if (!lockAcquired) {
    throw new Error(
      'Failed to acquire advisory lock within the specified timeout. Migration aborted.',
    );
  }
};

export const AdvisoryLock: DatabaseLock = {
  acquire: acquireAdvisoryLock,
  tryAcquire: tryAcquireAdvisoryLock,
  release: releaseAdvisoryLock,
  withAcquire: async <Result>(
    execute: SQLExecutor,
    handle: () => Promise<Result>,
    options: DatabaseLockOptions,
  ) => {
    await acquireAdvisoryLock(execute, options);
    try {
      return await handle();
    } finally {
      await releaseAdvisoryLock(execute, options);
    }
  },
};

export const advisoryLock = (
  execute: SQLExecutor,
  options: DatabaseLockOptions,
) => ({
  acquire: () => acquireAdvisoryLock(execute, options),
  tryAcquire: () => tryAcquireAdvisoryLock(execute, options),
  release: () => releaseAdvisoryLock(execute, options),
  withAcquire: async <Result>(handle: () => Promise<Result>) => {
    await acquireAdvisoryLock(execute, options);
    try {
      return await handle();
    } finally {
      await releaseAdvisoryLock(execute, options);
    }
  },
});
