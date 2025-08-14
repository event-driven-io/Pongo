import {
  type Connection,
  type ConnectorType,
  createDeferredConnectionPool,
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
  DatabaseOptions extends DumboConnectionOptions<Connector>,
  Connector extends ConnectorType = ConnectorType,
  ConnectionType extends Connection<Connector> = Connection<Connector>,
>(options: DatabaseOptions): Dumbo<Connector, ConnectionType> {
  const { connectionString } = options;

  const { databaseType, driverName } = parseConnectionString(connectionString);

  const connector: Connector = `${databaseType}:${driverName}` as Connector;

  const importAndCreatePool = async () => {
    const plugin = await storagePluginRegistry.tryResolve<
      Connector,
      ConnectionType
    >(connector);

    if (plugin === null) {
      throw new Error(`No plugin found for connector: ${connector}`);
    }

    return plugin.createPool({ ...options, connector });
  };

  return createDeferredConnectionPool(connector, importAndCreatePool);
}
