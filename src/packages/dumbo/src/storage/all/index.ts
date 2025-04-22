import {
  type Connection,
  type ConnectionPool,
  type ConnectorType,
  createDeferredConnectionPool,
  type DumboConnectionOptions,
} from '../../core';
import type { PostgreSQLConnectionString } from '../postgresql/core';
import type { SQLiteConnectionString } from '../sqlite/core';
import {
  type DatabaseConnectionString,
  parseConnectionString,
} from './connections';

export * from './connections';

// Helper type to infer the connector type based on connection string
export type InferConnector<T extends DatabaseConnectionString> =
  T extends PostgreSQLConnectionString
    ? ConnectorType<'PostgreSQL', 'pg'>
    : T extends SQLiteConnectionString
      ? ConnectorType<'SQLite', 'sqlite3'>
      : never;

// Helper type to infer the connection type based on connection string
export type InferConnection<T extends DatabaseConnectionString> =
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
  ConnectionString extends DatabaseConnectionString,
  DatabaseOptions extends DumboConnectionOptions<ConnectionString>,
>(options: DatabaseOptions): ConnectionPool<InferConnection<ConnectionString>> {
  const { connectionString } = options;

  const { databaseType, driverName } = parseConnectionString(connectionString);

  const connector: InferConnection<ConnectionString>['connector'] =
    `${databaseType}:${driverName}` as InferConnection<ConnectionString>['connector'];

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
    }) => ConnectionPool<InferConnection<ConnectionString>> =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      'dumbo' in module ? module.dumbo : undefined;

    if (poolFactory === undefined)
      throw new Error(`No pool factory found for connector: ${connector}`);

    return poolFactory({ connector, ...options });
  };

  return createDeferredConnectionPool(
    connector,
    importAndCreatePool,
  ) as ConnectionPool<InferConnection<ConnectionString>>;
}
