import { type Dumbo, type DumboConnectionOptions } from '..';
import type { Connection } from '../connections';
import type { DatabaseDriverType } from '../drivers';
import type { MigratorOptions } from '../schema';
import type { SQLFormatter } from '../sql';

export interface StoragePlugin<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  ConnectionType extends Connection<DriverType> = Connection<DriverType>,
> {
  readonly driverType: DriverType;

  createPool(
    options: DumboConnectionOptions,
  ): Dumbo<DriverType, ConnectionType>;

  readonly sqlFormatter: SQLFormatter;

  readonly defaultMigratorOptions: MigratorOptions;
}

export const StoragePluginRegistry = () => {
  const plugins = new Map<
    DatabaseDriverType,
    StoragePlugin | (() => Promise<StoragePlugin>)
  >();

  const register = <
    DriverType extends DatabaseDriverType = DatabaseDriverType,
    ConnectionType extends Connection<DriverType> = Connection<DriverType>,
  >(
    driverType: DriverType,
    plugin:
      | StoragePlugin<DriverType, ConnectionType>
      | (() => Promise<StoragePlugin<DriverType, ConnectionType>>),
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
    DriverType extends DatabaseDriverType = DatabaseDriverType,
    ConnectionType extends Connection<DriverType> = Connection<DriverType>,
  >(
    driverType: DatabaseDriverType,
  ): Promise<StoragePlugin<DriverType, ConnectionType> | null> => {
    const entry = plugins.get(driverType);

    if (!entry) return null;

    if (typeof entry !== 'function')
      return entry as unknown as StoragePlugin<DriverType, ConnectionType>;

    const plugin = await entry();

    register(driverType, plugin);
    return plugin as unknown as StoragePlugin<DriverType, ConnectionType>;
  };

  const tryGet = <
    DriverType extends DatabaseDriverType = DatabaseDriverType,
    ConnectionType extends Connection<DriverType> = Connection<DriverType>,
  >(
    driverType: DatabaseDriverType,
  ): StoragePlugin<DriverType, ConnectionType> | null => {
    const entry = plugins.get(driverType);
    return entry && typeof entry !== 'function'
      ? (entry as unknown as StoragePlugin<DriverType, ConnectionType>)
      : null;
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
