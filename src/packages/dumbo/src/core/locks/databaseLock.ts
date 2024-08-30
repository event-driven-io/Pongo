import { type SQLExecutor } from '..';

export type DatabaseLockOptions = { lockId: number; timeoutMs?: number };

export type AcquireDatabaseLockMode = 'Permanent' | 'Session';

export type AcquireDatabaseLockOptions = DatabaseLockOptions & {
  mode?: AcquireDatabaseLockMode;
};
export type ReleaseDatabaseLockOptions = DatabaseLockOptions;

export const defaultDatabaseLockOptions: Required<
  Omit<DatabaseLockOptions, 'lockId'>
> = {
  timeoutMs: 10000,
};

export type DatabaseLock = {
  acquire(
    execute: SQLExecutor,
    options: AcquireDatabaseLockOptions,
  ): Promise<void>;
  tryAcquire(
    execute: SQLExecutor,
    options: AcquireDatabaseLockOptions,
  ): Promise<boolean>;
  release(
    execute: SQLExecutor,
    options: ReleaseDatabaseLockOptions,
  ): Promise<boolean>;
  withAcquire: <Result = unknown>(
    execute: SQLExecutor,
    handle: () => Promise<Result>,
    options: AcquireDatabaseLockOptions,
  ) => Promise<Result>;
};
