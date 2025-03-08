import {
  defaultDatabaseLockOptions,
  type AcquireDatabaseLockMode,
  type AcquireDatabaseLockOptions,
  type DatabaseLock,
  type DatabaseLockOptions,
  type ReleaseDatabaseLockOptions,
} from '..';
import { single, sql, type SQLExecutor } from '../../../../core';

export const tryAcquireAdvisoryLock = async (
  execute: SQLExecutor,
  options: AcquireDatabaseLockOptions,
): Promise<boolean> => {
  const timeoutMs = options.timeoutMs ?? defaultDatabaseLockOptions.timeoutMs;

  const advisoryLock =
    options.mode === 'Permanent' ? 'pg_advisory_lock' : 'pg_advisory_xact_lock';

  try {
    await single(
      execute.query<{ locked: boolean }>(
        sql('SELECT %s(%s) AS locked', advisoryLock, options.lockId),
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
  options: ReleaseDatabaseLockOptions,
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
  options: AcquireDatabaseLockOptions,
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
    options: AcquireDatabaseLockOptions,
  ) => {
    await acquireAdvisoryLock(execute, options);
    try {
      return await handle();
    } finally {
      if (options.mode === 'Permanent')
        await releaseAdvisoryLock(execute, options);
    }
  },
};

export const advisoryLock = (
  execute: SQLExecutor,
  options: DatabaseLockOptions,
) => ({
  acquire: (acquireOptions?: { mode: AcquireDatabaseLockMode }) =>
    acquireAdvisoryLock(execute, {
      ...options,
      ...(acquireOptions ?? {}),
    }),
  tryAcquire: (acquireOptions?: { mode: AcquireDatabaseLockMode }) =>
    tryAcquireAdvisoryLock(execute, {
      ...options,
      ...(acquireOptions ?? {}),
    }),
  release: () => releaseAdvisoryLock(execute, options),
  withAcquire: async <Result>(
    handle: () => Promise<Result>,
    acquireOptions?: { mode: AcquireDatabaseLockMode },
  ) => {
    await acquireAdvisoryLock(execute, {
      ...options,
      ...(acquireOptions ?? {}),
    });
    try {
      return await handle();
    } finally {
      await releaseAdvisoryLock(execute, options);
    }
  },
});
