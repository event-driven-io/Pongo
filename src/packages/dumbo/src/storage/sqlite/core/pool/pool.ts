import {
  InMemorySQLiteDatabase,
  sqliteConnection,
  SQLiteConnectionString,
  type AnySQLiteConnection,
  type SQLiteClient,
  type SQLiteClientConnection,
  type SQLiteClientConnectionOptions,
  type SQLiteClientFactory,
  type SQLiteClientOptions,
  type SQLiteConnectionDefinition,
  type SQLiteDriverType,
  type SQLitePoolClientConnection,
} from '..';
import {
  createConnectionPool,
  JSONSerializer,
  type ConnectionPool,
} from '../../../../core';

export type SQLiteAmbientClientPool<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = ConnectionPool<SQLiteClientConnection<DriverType>>;

export type SQLiteAmbientConnectionPool<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = ConnectionPool<
  SQLitePoolClientConnection<DriverType> | SQLiteClientConnection<DriverType>
>;

export type SQLitePool<DriverType extends SQLiteDriverType = SQLiteDriverType> =
  SQLiteAmbientClientPool<DriverType> | SQLiteAmbientConnectionPool<DriverType>;

// TODO: Add connection pool handling

export const sqliteAmbientConnectionPool = <
  DriverType extends SQLiteDriverType = SQLiteDriverType,
>(options: {
  driverType: DriverType;
  connection:
    | SQLitePoolClientConnection<DriverType>
    | SQLiteClientConnection<DriverType>;
}): SQLiteAmbientConnectionPool<DriverType> => {
  const { connection, driverType } = options;

  return createConnectionPool({
    driverType,
    getConnection: () => connection,
    execute: connection.execute,
    transaction: () => connection.transaction(),
    withTransaction: (handle) => connection.withTransaction(handle),
  });
};

export const sqliteSingletonClientPool = <
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClient = SQLiteClient,
  ClientOptions = SQLiteClientOptions,
>(
  options: {
    driverType: DriverType;
    database?: string | undefined;
    allowNestedTransactions?: boolean;
  } & SQLiteClientFactoryOptions<SQLiteClientType, ClientOptions> &
    ClientOptions,
): SQLiteAmbientClientPool<DriverType> => {
  const { driverType, sqliteClient } = options;
  let connection:
    | SQLiteClientConnection<DriverType, SQLiteClientType>
    | undefined = undefined;

  const getConnection = () => {
    if (connection) return connection;

    const connect = async () => {
      const client = sqliteClient(options);

      await client.connect();

      return client;
    };

    return (connection = sqliteConnection({
      driverType,
      type: 'Client',
      connect,
      transaction: {
        allowNestedTransactions: options.allowNestedTransactions ?? false,
      },
      close: () => Promise.resolve(),
    }));
  };

  const open = () => Promise.resolve(getConnection());
  const close = async () => {
    if (connection !== undefined) await connection.close();
  };

  return createConnectionPool({
    driverType,
    connection: open,
    close,
    getConnection,
  });
};

export const sqliteAlwaysNewClientPool = <
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClient = SQLiteClient,
  ClientOptions = SQLiteClientOptions,
>(
  options: {
    driverType: DriverType;
    database?: string | undefined;
    allowNestedTransactions?: boolean;
  } & SQLiteClientFactoryOptions<SQLiteClientType, ClientOptions> &
    ClientOptions,
): SQLiteAmbientClientPool<DriverType> => {
  const { driverType, allowNestedTransactions, sqliteClient } = options;

  return createConnectionPool({
    driverType,
    getConnection: () => {
      const connect = async () => {
        const client = sqliteClient(options);

        await client.connect();

        return client;
      };

      return sqliteConnection({
        driverType,
        type: 'Client',
        connect,
        transaction: {
          allowNestedTransactions: allowNestedTransactions ?? false,
        },
        close: (client) => (client as SQLiteClientType).close(),
      });
    },
  });
};

export const sqliteAmbientClientPool = <
  DriverType extends SQLiteDriverType = SQLiteDriverType,
>(options: {
  driverType: DriverType;
  client: SQLiteClient;
  allowNestedTransactions: boolean;
}): SQLiteAmbientClientPool<DriverType> => {
  const { client, driverType, allowNestedTransactions } = options;

  const getConnection = () => {
    const connect = () => Promise.resolve(client);

    return sqliteConnection({
      driverType,
      type: 'Client',
      connect,
      transaction: {
        allowNestedTransactions,
      },
      close: () => Promise.resolve(),
    });
  };

  const open = () => Promise.resolve(getConnection());
  const close = () => Promise.resolve();

  return createConnectionPool({
    driverType,
    connection: open,
    close,
    getConnection,
  });
};

export type SQLiteFileNameOrConnectionString =
  | {
      fileName: string | SQLiteConnectionString;
      connectionString?: never;
    }
  | {
      connectionString: string | SQLiteConnectionString;
      fileName?: never;
    };

export type SQLitePoolPooledOptions<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = {
  driverType: DriverType;
  pooled?: true;
  singleton?: boolean;
  allowNestedTransactions?: boolean;
};

export type SQLitePoolNotPooledOptions<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> =
  | {
      driverType: DriverType;
      connection?: never;
      client: SQLiteClient;
      pooled?: false;
      singleton?: true;
      allowNestedTransactions?: boolean;
    }
  | {
      driverType: DriverType;
      connection?: never;
      client?: never;
      pooled?: boolean;
      singleton?: boolean;
      allowNestedTransactions?: boolean;
    }
  | {
      driverType: DriverType;
      connection:
        | SQLitePoolClientConnection<DriverType>
        | SQLiteClientConnection<DriverType>;
      client?: never;
      pooled?: false;
      singleton?: true;
      allowNestedTransactions?: boolean;
    };

export type SQLiteDumboConnectionOptions<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = (
  | SQLitePoolPooledOptions<DriverType>
  | SQLitePoolNotPooledOptions<DriverType>
) & {
  serializer?: JSONSerializer;
};

export type SQLiteClientFactoryOptions<
  SQLiteClientType extends SQLiteClient = SQLiteClient,
  ClientOptions = SQLiteClientOptions,
> = {
  sqliteClient: SQLiteClientFactory<SQLiteClientType, ClientOptions>;
};

export type SQLiteConnectionFactoryOptions<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends
    SQLiteClientConnectionOptions<SQLiteConnectionType> = SQLiteClientConnectionOptions<SQLiteConnectionType>,
> = {
  sqliteConnection?: SQLiteConnectionDefinition<
    SQLiteConnectionType,
    ConnectionOptions
  >;
};

export function sqlitePool<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClient = SQLiteClient,
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ClientOptions = SQLiteClientOptions,
  ConnectionOptions extends
    SQLiteClientConnectionOptions<SQLiteConnectionType> = SQLiteClientConnectionOptions<SQLiteConnectionType>,
>(
  options: SQLitePoolNotPooledOptions<DriverType> &
    SQLiteClientFactoryOptions<SQLiteClientType, ClientOptions> &
    SQLiteConnectionFactoryOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLiteAmbientClientPool<DriverType>;

export function sqlitePool<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
  SQLiteClientType extends SQLiteClient = SQLiteClient,
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ClientOptions = SQLiteClientOptions,
  ConnectionOptions extends
    SQLiteClientConnectionOptions<SQLiteConnectionType> = SQLiteClientConnectionOptions<SQLiteConnectionType>,
>(
  options: SQLiteDumboConnectionOptions<DriverType> &
    SQLiteClientFactoryOptions<SQLiteClientType, ClientOptions> &
    SQLiteConnectionFactoryOptions<SQLiteConnectionType, ConnectionOptions> &
    ClientOptions,
):
  | SQLiteAmbientClientPool<DriverType>
  | SQLiteAmbientConnectionPool<DriverType> {
  const { driverType } = options;

  // TODO: Handle dates and bigints
  // setSQLiteTypeParser(serializer ?? JSONSerializer);

  if ('client' in options && options.client)
    return sqliteAmbientClientPool({
      driverType,
      client: options.client,
      allowNestedTransactions: options.allowNestedTransactions ?? false,
    });

  if ('connection' in options && options.connection)
    return sqliteAmbientConnectionPool({
      driverType,
      connection: options.connection,
    });

  if (
    options.singleton === true ||
    ('fileName' in options && options.fileName === InMemorySQLiteDatabase) ||
    ('connectionString' in options &&
      options.connectionString === InMemorySQLiteDatabase)
  )
    return sqliteSingletonClientPool(options);

  return sqliteAlwaysNewClientPool(options);
}
