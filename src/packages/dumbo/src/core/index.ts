import type { AnyConnection, ConnectionPool } from './connections';
import type {
  AnyDumboDatabaseDriver,
  DatabaseDriverType,
  ExtractDumboDatabaseDriverOptions,
} from './drivers';
import { dumboSchema } from './schema';
import { SQL, SQLColumnTypeTokensFactory } from './sql';

export * from './connections';
export * from './drivers';
export * from './errors';
export * from './execute';
export * from './locks';
export * from './query';
export * from './schema';
export * from './serializer';
export * from './sql';
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
