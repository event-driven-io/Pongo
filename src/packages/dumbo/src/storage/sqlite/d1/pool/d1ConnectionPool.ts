import type { D1ConnectionOptions } from '..';
import {
  createSingletonConnectionPool,
  type ConnectionPool,
} from '../../../../core';
import {
  d1Connection,
  D1DriverType,
  type D1Connection,
} from '../connections/d1Connection';

export type D1PoolOptions = D1ConnectionOptions;
export type D1ConnectionPool = ConnectionPool<D1Connection>;

export const d1Pool = (options: D1PoolOptions): D1ConnectionPool =>
  createSingletonConnectionPool<D1Connection>({
    driverType: D1DriverType,
    getConnection: () => d1Connection(options),
  });
