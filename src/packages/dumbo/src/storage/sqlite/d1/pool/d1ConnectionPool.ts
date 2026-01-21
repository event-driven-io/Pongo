import type { D1ConnectionOptions } from '..';
import { createSingletonConnectionPool } from '../../../../core';
import {
  d1Connection,
  D1DriverType,
  type D1Connection,
} from '../connections/connection';

export type D1PoolOptions = D1ConnectionOptions;

export const d1Pool = (options: D1PoolOptions) =>
  createSingletonConnectionPool<D1Connection>({
    driverType: D1DriverType,
    getConnection: () => d1Connection(options),
  });
