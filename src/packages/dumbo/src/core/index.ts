import type { AnyConnection, ConnectionPool } from './connections';
import type {
  AnyDumboDatabaseDriver,
  DatabaseDriverType,
  ExtractDumboDatabaseDriverOptions,
} from './drivers';

export * from './cancellation';
export * from './connections';
export * from './drivers';
export * from './errors';
export * from './execute';
export * from './locks';
export * from './query';
export * from './schema';
export * from './serializer';
export * from './sql';
export type { OperationContext } from './taskProcessing';
export * from './testing';
export * from './tracing';

export type Dumbo<
  // TODO: Get Rid of DumboType generic parameter if possible
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  ConnectionType extends AnyConnection = AnyConnection,
> = ConnectionPool<ConnectionType>;

export type DumboConnectionOptions<
  DatabaseDriver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
> =
  ExtractDumboDatabaseDriverOptions<DatabaseDriver> extends infer Options
    ? Options extends unknown
      ? {
          driver?: DatabaseDriver;
          driverType?: DatabaseDriver['driverType'];
        } & Omit<Options, 'driver' | 'driverType' | 'connectionString'>
      : never
    : never;
