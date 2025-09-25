import type { DatabaseConnectionString } from '../storage/all';
import { type Connection, type ConnectionPool } from './connections';
import type { DatabaseDriverType, InferDriverDatabaseType } from './drivers';
import type {
  AnyDumboDatabaseDriver,
  ExtractDumboDatabaseDriverOptions,
} from './plugins';

export * from './connections';
export * from './drivers';
export * from './execute';
export * from './locks';
export * from './plugins';
export * from './query';
export * from './schema';
export * from './serializer';
export * from './sql';
export * from './tracing';

export type Dumbo<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  ConnectionType extends Connection<DriverType> = Connection<DriverType>,
> = ConnectionPool<ConnectionType>;

export type DumboConnectionOptions<
  DatabaseDriver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
  ConnectionString extends DatabaseConnectionString<
    InferDriverDatabaseType<DatabaseDriver['driverType']>
  > = DatabaseConnectionString<
    InferDriverDatabaseType<DatabaseDriver['driverType']>
  >,
> = {
  driver?: DatabaseDriver;
  connectionString: string | ConnectionString;
} & Omit<ExtractDumboDatabaseDriverOptions<DatabaseDriver>, 'driver'>;
