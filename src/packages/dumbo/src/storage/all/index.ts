import {
  type Connection,
  type ConnectionPool,
  type ConnectorType,
  createDeferredConnectionPool,
  type Dumbo,
  type DumboConnectionOptions,
} from '../../core';
import type { PostgreSQLConnectionString } from '../postgresql/core';
import type { SQLiteConnectionString } from '../sqlite/core';
import {
  parseConnectionString,
  type SupportedDatabaseConnectionString,
} from './connections';

export * from './connections';

export type InferConnector<T extends SupportedDatabaseConnectionString> =
  T extends PostgreSQLConnectionString
    ? ConnectorType<'PostgreSQL', 'pg'>
    : T extends SQLiteConnectionString
      ? ConnectorType<'SQLite', 'sqlite3'>
      : never;

export type InferConnection<T extends SupportedDatabaseConnectionString> =
  T extends PostgreSQLConnectionString
    ? Connection<ConnectorType<'PostgreSQL', 'pg'>>
    : T extends SQLiteConnectionString
      ? Connection<ConnectorType<'SQLite', 'sqlite3'>>
      : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const importDrivers: Record<string, () => Promise<any>> = {
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

  const importDriver = importDrivers[connector];
  if (!importDriver) {
    throw new Error(`Unsupported connector: ${connector}`);
  }

  const importAndCreatePool = async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const module = await importDriver();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const poolFactory: (options: {
      connectionString: string;
    }) => ConnectionPool<Connection<Connector>> =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      'dumbo' in module ? module.dumbo : undefined;

    if (poolFactory === undefined)
      throw new Error(`No pool factory found for connector: ${connector}`);

    return poolFactory({ ...options, connector });
  };

  return createDeferredConnectionPool(connector, importAndCreatePool);
}
