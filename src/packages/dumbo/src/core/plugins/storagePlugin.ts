import {
  type Dumbo,
  type DumboConnectionOptions,
  type InferDriverDatabaseType,
} from '..';
import type { DatabaseConnectionString } from '../../storage/all';
import type { AnyConnection } from '../connections';
import type { DatabaseDriverType } from '../drivers';
import type { MigratorOptions } from '../schema';
import type { SQLFormatter } from '../sql';

// export interface StoragePlugin<
//   DriverType extends DatabaseDriverType = DatabaseDriverType,
//   ConnectionType extends Connection<DriverType> = Connection<DriverType>,
// > {
//   readonly driverType: DriverType;

//   createPool(
//     options: DumboConnectionOptions,
//   ): Dumbo<DriverType, ConnectionType>;

//   readonly sqlFormatter: SQLFormatter;

//   readonly defaultMigratorOptions: MigratorOptions;
// }

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

export const StoragePluginRegistry = () => {
  const plugins = new Map<
    DatabaseDriverType,
    DumboDatabaseDriver | (() => Promise<DumboDatabaseDriver>)
  >();

  const register = <Driver extends AnyDumboDatabaseDriver>(
    driverType: Driver['driverType'],
    plugin: Driver | (() => Promise<Driver>),
  ): void => {
    const entry = plugins.get(driverType);
    if (
      entry &&
      (typeof entry !== 'function' || typeof plugin === 'function')
    ) {
      return;
    }
    plugins.set(driverType, plugin);
  };

  const tryResolve = async <
    Driver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
  >(
    driverType: DatabaseDriverType,
  ): Promise<Driver | null> => {
    const entry = plugins.get(driverType);

    if (!entry) return null;

    if (typeof entry !== 'function') return entry as Driver;

    const plugin = await entry();

    register(driverType, plugin);
    return plugin as Driver;
  };

  const tryGet = <
    Driver extends AnyDumboDatabaseDriver = AnyDumboDatabaseDriver,
  >(
    driverType: DatabaseDriverType,
  ): Driver | null => {
    const entry = plugins.get(driverType);
    return entry && typeof entry !== 'function' ? (entry as Driver) : null;
  };

  const has = (driverType: DatabaseDriverType): boolean =>
    plugins.has(driverType);

  return {
    register,
    tryResolve,
    tryGet,
    has,
    get databaseDriverTypes(): DatabaseDriverType[] {
      return Array.from(plugins.keys());
    },
  };
};

declare global {
  // eslint-disable-next-line no-var
  var storagePluginRegistry: ReturnType<typeof StoragePluginRegistry>;
}

export const storagePluginRegistry = (globalThis.storagePluginRegistry =
  globalThis.storagePluginRegistry ?? StoragePluginRegistry());
