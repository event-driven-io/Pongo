import {
  createDeferredConnectionPool,
  type Connection,
  type DatabaseDriverType,
  type Dumbo,
  type DumboConnectionOptions,
} from '../../core';
import { storagePluginRegistry } from '../../core/plugins';
import { parseConnectionString } from './connections';

export * from './connections';

storagePluginRegistry.register('PostgreSQL:pg', () =>
  import('../postgresql/pg').then((m) => m.storagePlugin),
);

storagePluginRegistry.register('SQLite:sqlite3', () =>
  import('../sqlite/sqlite3').then((m) => m.storagePlugin),
);

export function dumbo<
  DatabaseOptions extends DumboConnectionOptions<DriverType>,
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  ConnectionType extends Connection<DriverType> = Connection<DriverType>,
>(options: DatabaseOptions): Dumbo<DriverType, ConnectionType> {
  const { connectionString } = options;

  const { databaseType, driverName } = parseConnectionString(connectionString);

  const driverType = `${databaseType}:${driverName}` as DriverType;

  const importAndCreatePool = async () => {
    const plugin = await storagePluginRegistry.tryResolve<
      DriverType,
      ConnectionType
    >(driverType);

    if (plugin === null) {
      throw new Error(
        `No plugin found for database driver type: ${driverType}`,
      );
    }

    return plugin.createPool({ ...options, driverType });
  };

  return createDeferredConnectionPool(driverType, importAndCreatePool);
}
