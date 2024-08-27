import { type SQLExecutor, single, sql } from '../../../core';

export type AcquireAdvisoryLockOptions = { lockId: number; timeoutMs?: number };

export const defaultAcquireAdvisoryLockOptions: Required<
  Omit<AcquireAdvisoryLockOptions, 'lockId'>
> = {
  timeoutMs: 10000,
};

export const tryAcquireAdvisoryLock = async (
  execute: SQLExecutor,
  options: AcquireAdvisoryLockOptions,
): Promise<boolean> => {
  const timeoutMs =
    options.timeoutMs ?? defaultAcquireAdvisoryLockOptions.timeoutMs;

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
  options: AcquireAdvisoryLockOptions,
): Promise<boolean> => {
  const timeoutMs =
    options.timeoutMs ?? defaultAcquireAdvisoryLockOptions.timeoutMs;

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
  options: AcquireAdvisoryLockOptions,
) => {
  const lockAcquired = await tryAcquireAdvisoryLock(execute, options);
  if (!lockAcquired) {
    throw new Error(
      'Failed to acquire advisory lock within the specified timeout. Migration aborted.',
    );
  }
};
