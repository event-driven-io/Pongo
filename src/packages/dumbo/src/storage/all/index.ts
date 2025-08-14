import {
  type Connection,
  type ConnectorType,
  createDeferredConnectionPool,
  type Dumbo,
  type DumboConnectionOptions,
} from '../../core';
import { pluginRegistry } from '../../core/plugins';
import { parseConnectionString } from './connections';

export * from './connections';

const importPlugins: Record<string, () => Promise<unknown>> = {
  'PostgreSQL:pg': () => import('../postgresql/pg'),
  'SQLite:sqlite3': () => import('../sqlite/sqlite3'),
};

export function dumbo<
  DatabaseOptions extends DumboConnectionOptions<Connector>,
  Connector extends ConnectorType = ConnectorType,
  ConnectionType extends Connection<Connector> = Connection<Connector>,
>(options: DatabaseOptions): Dumbo<Connector, ConnectionType> {
  const { connectionString } = options;

  const { databaseType, driverName } = parseConnectionString(connectionString);

  const connector: Connector = `${databaseType}:${driverName}` as Connector;

  const importPlugin = importPlugins[connector];
  if (!importPlugin) {
    throw new Error(`Unsupported connector: ${connector}`);
  }

  const importAndCreatePool = async () => {
    if (!pluginRegistry.has(connector)) {
      await importPlugin();
    }

    const plugin = pluginRegistry.tryGet<Connector, ConnectionType>(connector);

    if (plugin === null) {
      throw new Error(`No plugin found for connector: ${connector}`);
    }

    return plugin.createPool({ ...options, connector });
  };

  return createDeferredConnectionPool(connector, importAndCreatePool);
}
