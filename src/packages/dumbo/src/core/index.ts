import type { DatabaseConnectionString } from '../storage/all';
import { type Connection, type ConnectionPool } from './connections';
import type {
  AnyDumboDatabaseDriver,
  DatabaseDriverType,
  ExtractDumboDatabaseDriverOptions,
  InferDriverDatabaseType,
} from './drivers';
import { dumboSchema } from './schema';
import { SQL, SQLColumnTypeTokensFactory } from './sql';

export * from './connections';
export * from './drivers';
export * from './execute';
export * from './locks';
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
> =
  ExtractDumboDatabaseDriverOptions<DatabaseDriver> extends infer Options
    ? Options extends unknown
      ? {
          driver?: DatabaseDriver;
          driverType?: DatabaseDriver['driverType'];
          connectionString: string | ConnectionString;
        } & Omit<Options, 'driver' | 'driverType' | 'connectionString'>
      : never
    : never;

declare module './sql' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace SQL {
    export const columnN: typeof dumboSchema.column & {
      type: typeof SQLColumnTypeTokensFactory;
    };
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
(SQL as any).columnN = Object.assign(dumboSchema.column, {
  type: SQLColumnTypeTokensFactory,
});
