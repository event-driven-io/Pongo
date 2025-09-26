import type { DatabaseDriverType } from '.';
import {
  type Dumbo,
  type DumboConnectionOptions,
  type InferDriverDatabaseType,
} from '..';
import type { DatabaseConnectionString } from '../../storage/all';
import type { AnyConnection } from '../connections';
import type { MigratorOptions } from '../schema';
import type { SQLFormatter } from '../sql';

export interface DumboDatabaseDriver<
  ConnectionType extends AnyConnection = AnyConnection,
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint, @typescript-eslint/no-unused-vars
  DriverOptions extends unknown = unknown,
  ConnectionString extends DatabaseConnectionString<
    InferDriverDatabaseType<ConnectionType['driverType']>
  > = DatabaseConnectionString<
    InferDriverDatabaseType<ConnectionType['driverType']>
  >,
  DumboType extends Dumbo<ConnectionType['driverType'], ConnectionType> = Dumbo<
    ConnectionType['driverType'],
    ConnectionType
  >,
> {
  readonly driverType: ConnectionType['driverType'];
  readonly sqlFormatter: SQLFormatter;
  readonly defaultMigratorOptions: MigratorOptions;
  readonly defaultConnectionString: string;

  getDatabaseNameOrDefault(connectionString: string): string;

  createPool(
    options: DumboConnectionOptions<this, ConnectionString>,
  ): DumboType;

  tryParseConnectionString(connectionString: string): ConnectionString | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDumboDatabaseDriver = DumboDatabaseDriver<AnyConnection, any>;

export type ExtractDumboDatabaseDriverOptions<DatabaseDriver> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseDriver extends DumboDatabaseDriver<any, infer O, any, any>
    ? O
    : never;

export type ExtractDumboConnectionFromDriver<DatabaseDriver> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseDriver extends DumboDatabaseDriver<infer D, any, any, any>
    ? D
    : never;

export type ExtractDumboTypeFromDriver<DatabaseDriver> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseDriver extends DumboDatabaseDriver<any, any, any, infer D>
    ? D
    : never;

type DatabaseDriverResolutionOptions = {
  driverType?: DatabaseDriverType | undefined;
  connectionString: string;
};

export const DumboDatabaseDriverRegistry = () => {
  const drivers = new Map<
    DatabaseDriverType,
    DumboDatabaseDriver | (() => Promise<DumboDatabaseDriver>)
  >();

  const register = <Driver extends AnyDumboDatabaseDriver>(
    driverType: Driver['driverType'],
    plugin: Driver | (() => Promise<Driver>),
  ): void => {
    const entry = drivers.get(driverType);
    if (
      entry &&
      (typeof entry !== 'function' || typeof plugin === 'function')
    ) {
      return;
    }
    drivers.set(driverType, plugin);
  };

  const getDriver = ({
    driverType,
    connectionString,
  }: DatabaseDriverResolutionOptions) =>
    driverType
      ? drivers.get(driverType)
      : [...drivers.values()].find(
          (d) =>
            typeof d !== 'function' &&
            d.tryParseConnectionString(connectionString),
        );

  const tryResolve = async <
    Driver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
  >(
    options: DatabaseDriverResolutionOptions,
  ): Promise<Driver | null> => {
    const driver = getDriver(options);

    if (!driver) return null;

    if (typeof driver !== 'function') return driver as Driver;

    const plugin = await driver();

    register(plugin.driverType, plugin);
    return plugin as Driver;
  };

  const tryGet = <
    Driver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
  >(
    options: DatabaseDriverResolutionOptions,
  ): Driver | null => {
    const driver = getDriver(options);

    return driver && typeof driver !== 'function' ? (driver as Driver) : null;
  };

  const has = (driverType: DatabaseDriverType): boolean =>
    drivers.has(driverType);

  return {
    register,
    tryResolve,
    tryGet,
    has,
    get databaseDriverTypes(): DatabaseDriverType[] {
      return Array.from(drivers.keys());
    },
  };
};

declare global {
  var dumboDatabaseDriverRegistry: ReturnType<
    typeof DumboDatabaseDriverRegistry
  >;
}

export const dumboDatabaseDriverRegistry =
  (globalThis.dumboDatabaseDriverRegistry =
    globalThis.dumboDatabaseDriverRegistry ?? DumboDatabaseDriverRegistry());
