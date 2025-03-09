import {
  InMemorySQLiteDatabase,
  sqliteConnection,
  type SQLiteClient,
  type SQLiteClientConnection,
  type SQLiteConnectorType,
  type SQLitePoolClientConnection,
} from '..';
import { sqliteClientProvider } from '../..';
import {
  createConnectionPool,
  JSONSerializer,
  type ConnectionPool,
} from '../../../../core';

export type SQLiteAmbientClientPool = ConnectionPool<SQLiteClientConnection>;

export type SQLiteAmbientConnectionPool = ConnectionPool<
  SQLitePoolClientConnection | SQLiteClientConnection
>;

export type SQLitePool = SQLiteAmbientClientPool | SQLiteAmbientConnectionPool;

// TODO: Add connection pool handling

export const sqliteAmbientConnectionPool = <
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(options: {
  connector: ConnectorType;
  connection:
    | SQLitePoolClientConnection<ConnectorType>
    | SQLiteClientConnection<ConnectorType>;
}): SQLiteAmbientConnectionPool => {
  const { connection, connector: connectorType } = options;

  return createConnectionPool({
    connector: connectorType,
    getConnection: () => connection,
    execute: connection.execute,
    transaction: () => connection.transaction(),
    withTransaction: (handle) => connection.withTransaction(handle),
  });
};

export const sqliteSingletonClientPool = <
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(options: {
  connector: ConnectorType;
  fileName: string;
  database?: string | undefined;
}): SQLiteAmbientClientPool => {
  const { connector, fileName } = options;
  let connection: SQLiteClientConnection | undefined = undefined;

  const getConnection = () => {
    if (connection) return connection;

    const connect = sqliteClientProvider(connector).then((sqliteClient) =>
      sqliteClient({ fileName }),
    );

    return (connection = sqliteConnection({
      connector,
      type: 'Client',
      connect,
      close: () => Promise.resolve(),
    }));
  };

  const open = () => Promise.resolve(getConnection());
  const close = async () => {
    if (connection !== undefined) await connection.close();
  };

  return createConnectionPool({
    connector: connector,
    connection: open,
    close,
    getConnection,
  });
};

export const sqliteAlwaysNewClientPool = <
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(options: {
  connector: ConnectorType;
  fileName: string;
  database?: string | undefined;
}): SQLiteAmbientClientPool => {
  const { connector, fileName } = options;

  return createConnectionPool({
    connector: connector,
    getConnection: () => {
      const connect = sqliteClientProvider(connector).then((sqliteClient) =>
        sqliteClient({ fileName }),
      );

      return sqliteConnection({
        connector,
        type: 'Client',
        connect,
        close: (client) => client.close(),
      });
    },
  });
};

export const sqliteAmbientClientPool = <
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(options: {
  connector: ConnectorType;
  client: SQLiteClient;
}): SQLiteAmbientClientPool => {
  const { client, connector } = options;

  const getConnection = () => {
    const connect = Promise.resolve(client);

    return sqliteConnection({
      connector,
      type: 'Client',
      connect,
      close: () => Promise.resolve(),
    });
  };

  const open = () => Promise.resolve(getConnection());
  const close = () => Promise.resolve();

  return createConnectionPool({
    connector: connector,
    connection: open,
    close,
    getConnection,
  });
};

export type SQLitePoolPooledOptions<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = {
  connector: ConnectorType;
  fileName: string;
  pooled?: true;
  singleton?: boolean;
};

export type SQLitePoolNotPooledOptions<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> =
  | {
      connector: ConnectorType;
      fileName: string;
      pooled?: false;
      client: SQLiteClient;
      singleton?: true;
    }
  | {
      connector: ConnectorType;
      fileName: string;
      pooled?: boolean;
      singleton?: boolean;
    }
  | {
      connector: ConnectorType;
      fileName: string;
      connection:
        | SQLitePoolClientConnection<ConnectorType>
        | SQLiteClientConnection<ConnectorType>;
      pooled?: false;
      singleton?: true;
    };

export type SQLitePoolOptions<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = (
  | SQLitePoolPooledOptions<ConnectorType>
  | SQLitePoolNotPooledOptions<ConnectorType>
) & {
  serializer?: JSONSerializer;
};

export function sqlitePool<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(options: SQLitePoolNotPooledOptions<ConnectorType>): SQLiteAmbientClientPool;
export function sqlitePool<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  options: SQLitePoolOptions<ConnectorType>,
): SQLiteAmbientClientPool | SQLiteAmbientConnectionPool {
  const { fileName, connector } = options;

  // TODO: Handle dates and bigints
  // setSQLiteTypeParser(serializer ?? JSONSerializer);

  if ('client' in options && options.client)
    return sqliteAmbientClientPool({ connector, client: options.client });

  if ('connection' in options && options.connection)
    return sqliteAmbientConnectionPool({
      connector,
      connection: options.connection,
    });

  if (options.singleton === true || options.fileName == InMemorySQLiteDatabase)
    return sqliteSingletonClientPool({ connector, fileName });

  return sqliteAlwaysNewClientPool({ connector, fileName });
}
