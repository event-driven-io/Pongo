import { type SQLExecutor } from '../../../core';

export type DatabaseLockOptions = { lockId: number; timeoutMs?: number };

export const defaultDatabaseLockOptions: Required<
  Omit<DatabaseLockOptions, 'lockId'>
> = {
  timeoutMs: 10000,
};

export type DatabaseLock = {
  acquire(execute: SQLExecutor, options: DatabaseLockOptions): Promise<void>;
  tryAcquire(
    execute: SQLExecutor,
    options: DatabaseLockOptions,
  ): Promise<boolean>;
  release(execute: SQLExecutor, options: DatabaseLockOptions): Promise<boolean>;
  withAcquire: <Result = unknown>(
    execute: SQLExecutor,
    handle: () => Promise<Result>,
    options: DatabaseLockOptions,
  ) => Promise<Result>;
};
