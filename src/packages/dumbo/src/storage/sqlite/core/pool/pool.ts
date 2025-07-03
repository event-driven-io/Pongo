import {
  InMemorySQLiteDatabase,
  sqliteClientProvider,
  sqliteConnection,
  SQLiteConnectionString,
  transactionNestingCounter,
  type SQLiteClient,
  type SQLiteClientConnection,
  type SQLiteConnectorType,
  type SQLitePoolClientConnection,
} from '..';
import {
  createConnectionPool,
  JSONSerializer,
  type ConnectionPool,
} from '../../../../core';

export type SQLiteAmbientClientPool<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = ConnectionPool<SQLiteClientConnection<ConnectorType>>;

export type SQLiteAmbientConnectionPool<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = ConnectionPool<
  | SQLitePoolClientConnection<ConnectorType>
  | SQLiteClientConnection<ConnectorType>
>;

export type SQLitePool<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> =
  | SQLiteAmbientClientPool<ConnectorType>
  | SQLiteAmbientConnectionPool<ConnectorType>;

// TODO: Add connection pool handling

export const sqliteAmbientConnectionPool = <
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(options: {
  connector: ConnectorType;
  connection:
    | SQLitePoolClientConnection<ConnectorType>
    | SQLiteClientConnection<ConnectorType>;
}): SQLiteAmbientConnectionPool<ConnectorType> => {
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
>(
  options: {
    connector: ConnectorType;
    database?: string | undefined;
  } & SQLiteFileNameOrConnectionString,
): SQLiteAmbientClientPool<ConnectorType> => {
  const { connector } = options;
  let connection: SQLiteClientConnection | undefined = undefined;

  const getConnection = () => {
    const transactionCounter = transactionNestingCounter();
    if (connection) return connection;

    const connect = sqliteClientProvider(connector).then(
      async (sqliteClient) => {
        const client = sqliteClient(options);

        await client.connect();

        return client;
      },
    );

    return (connection = sqliteConnection({
      connector,
      type: 'Client',
      connect,
      transactionCounter,
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
>(
  options: {
    connector: ConnectorType;
    database?: string | undefined;
  } & SQLiteFileNameOrConnectionString,
): SQLiteAmbientClientPool<ConnectorType> => {
  const { connector } = options;

  return createConnectionPool({
    connector: connector,
    getConnection: () => {
      const transactionCounter = transactionNestingCounter();
      const connect = sqliteClientProvider(connector).then(
        async (sqliteClient) => {
          const client = sqliteClient(options);

          await client.connect();

          return client;
        },
      );

      return sqliteConnection({
        connector,
        type: 'Client',
        connect,
        transactionCounter,
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
}): SQLiteAmbientClientPool<ConnectorType> => {
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

export type SQLiteFileNameOrConnectionString =
  | {
      // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      fileName: string | SQLiteConnectionString;
      connectionString?: never;
    }
  | {
      // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
      connectionString: string | SQLiteConnectionString;
      fileName?: never;
    };

export type SQLitePoolPooledOptions<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> = {
  connector: ConnectorType;
  pooled?: true;
  singleton?: boolean;
};

export type SQLitePoolNotPooledOptions<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
> =
  | {
      connector: ConnectorType;
      pooled?: false;
      client: SQLiteClient;
      singleton?: true;
    }
  | {
      connector: ConnectorType;
      pooled?: boolean;
      singleton?: boolean;
    }
  | {
      connector: ConnectorType;
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
} & SQLiteFileNameOrConnectionString;

export function sqlitePool<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  options: SQLitePoolNotPooledOptions<ConnectorType> &
    SQLiteFileNameOrConnectionString,
): SQLiteAmbientClientPool<ConnectorType>;
export function sqlitePool<
  ConnectorType extends SQLiteConnectorType = SQLiteConnectorType,
>(
  options: SQLitePoolOptions<ConnectorType>,
):
  | SQLiteAmbientClientPool<ConnectorType>
  | SQLiteAmbientConnectionPool<ConnectorType> {
  const { connector } = options;

  // TODO: Handle dates and bigints
  // setSQLiteTypeParser(serializer ?? JSONSerializer);

  if ('client' in options && options.client)
    return sqliteAmbientClientPool({ connector, client: options.client });

  if ('connection' in options && options.connection)
    return sqliteAmbientConnectionPool({
      connector,
      connection: options.connection,
    });

  if (
    options.singleton === true ||
    options.fileName === InMemorySQLiteDatabase ||
    options.connectionString === InMemorySQLiteDatabase
  )
    return sqliteSingletonClientPool(options);

  return sqliteAlwaysNewClientPool(options);
}
