import type { DatabaseDriverType } from '.';
import type { Dumbo, DumboConnectionOptions } from '..';
import type { AnyConnection } from '../connections';
import type { MigratorOptions } from '../schema';
import type { SQLFormatter } from '../sql';
import type { DatabaseMetadata } from './databaseMetadata';

export interface DumboDatabaseDriver<
  ConnectionType extends AnyConnection = AnyConnection,
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint, @typescript-eslint/no-unused-vars
  DriverOptions extends unknown = unknown,
  DumboType extends Dumbo<ConnectionType['driverType'], ConnectionType> = Dumbo<
    ConnectionType['driverType'],
    ConnectionType
  >,
> {
  readonly driverType: ConnectionType['driverType'];
  readonly sqlFormatter: SQLFormatter;
  readonly defaultMigratorOptions: MigratorOptions;
  readonly databaseMetadata: DatabaseMetadata;

  createPool(options: DumboConnectionOptions<this>): DumboType;

  canHandle(options: DumboConnectionOptions<this>): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDumboDatabaseDriver = DumboDatabaseDriver<AnyConnection, any>;

export type ExtractDumboDatabaseDriverOptions<DatabaseDriver> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseDriver extends DumboDatabaseDriver<any, infer O, any> ? O : never;

export type ExtractDumboTypeFromDriver<DatabaseDriver> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseDriver extends DumboDatabaseDriver<any, any, infer D> ? D : never;

export const canHandleDriverWithConnectionString =
  <
    DatabaseDriver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
    ConnectionOptions extends DumboConnectionOptions<DatabaseDriver> =
      DumboConnectionOptions<DatabaseDriver>,
  >(
    driver: DatabaseDriver['driverType'],
    tryParseConnectionString: (connectionString: string) => string | null,
  ) =>
  (options: ConnectionOptions): boolean => {
    if ('driverType' in options) return options.driverType === driver;

    if (
      'connectionString' in options &&
      typeof options.connectionString === 'string'
    )
      return tryParseConnectionString(options.connectionString) !== null;

    return false;
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

  const getDriver = <
    Driver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
    ConnectionOptions extends DumboConnectionOptions<Driver> =
      DumboConnectionOptions<Driver>,
  >(
    options: ConnectionOptions,
  ) =>
    options.driverType
      ? drivers.get(options.driverType)
      : [...drivers.values()].find(
          (d) => typeof d !== 'function' && d.canHandle(options),
        );

  const tryResolve = async <
    Driver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
    ConnectionOptions extends DumboConnectionOptions<Driver> =
      DumboConnectionOptions<Driver>,
  >(
    options: ConnectionOptions,
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
    ConnectionOptions extends DumboConnectionOptions<Driver> =
      DumboConnectionOptions<Driver>,
  >(
    options: ConnectionOptions,
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
