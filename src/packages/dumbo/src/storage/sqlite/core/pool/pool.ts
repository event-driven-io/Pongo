import {
  InMemorySQLiteDatabase,
  sqliteConnection,
  SQLiteConnectionString,
  type AnySQLiteConnection,
  type SQLiteClient,
  type SQLiteClientConnection,
  type SQLiteClientConnectionDefinitionOptions,
  type SQLiteConnectionFactory,
  type SQLiteDriverType,
  type SQLitePoolClientConnection,
} from '..';
import {
  createConnectionPool,
  JSONSerializer,
  type ConnectionPool,
  type InferDbClientFromConnection,
} from '../../../../core';
import { sqliteClient } from '../../sqlite3';

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
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends
    SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType> = SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
>(
  options: {
    driverType: SQLiteConnectionType['driverType'];
    database?: string | undefined;
    allowNestedTransactions?: boolean;
  } & SQLiteConnectionFactoryOptions<SQLiteConnectionType, ConnectionOptions> &
    ConnectionOptions,
): SQLiteAmbientClientPool<SQLiteConnectionType['driverType']> => {
  const { driverType, sqliteConnection } = options;
  let connection: SQLiteConnectionType | undefined = undefined;

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
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends
    SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType> = SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
>(
  options: {
    driverType: SQLiteConnectionType['driverType'];
    database?: string | undefined;
    allowNestedTransactions?: boolean;
  } & SQLiteConnectionFactoryOptions<SQLiteConnectionType, ConnectionOptions> &
    ConnectionOptions,
): SQLiteAmbientClientPool<SQLiteConnectionType['driverType']> => {
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
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> =
  | {
      driverType: SQLiteConnectionType['driverType'];
      connection?: never;
      client: InferDbClientFromConnection<SQLiteConnectionType>;
      pooled?: false;
      singleton?: true;
      allowNestedTransactions?: boolean;
    }
  | {
      driverType: SQLiteConnectionType['driverType'];
      connection?: never;
      client?: never;
      pooled?: boolean;
      singleton?: boolean;
      allowNestedTransactions?: boolean;
    }
  | {
      driverType: SQLiteConnectionType['driverType'];
      connection: SQLiteConnectionType;
      client?: never;
      pooled?: false;
      singleton?: true;
      allowNestedTransactions?: boolean;
    };

export type SQLiteDumboConnectionOptions<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> = (
  | SQLitePoolPooledOptions<SQLiteConnectionType['driverType']>
  | SQLitePoolNotPooledOptions<SQLiteConnectionType>
) & {
  serializer?: JSONSerializer;
};

export type SQLiteConnectionFactoryOptions<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends
    SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType> = SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
> = {
  sqliteConnection?: SQLiteConnectionFactory<
    SQLiteConnectionType,
    ConnectionOptions
  >;
};

export function sqlitePool<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends
    SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType> = SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
>(
  options: SQLitePoolNotPooledOptions<SQLiteConnectionType> &
    SQLiteConnectionFactoryOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLiteAmbientClientPool<SQLiteConnectionType['driverType']>;

export function sqlitePool<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends
    SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType> = SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
>(
  options: SQLiteDumboConnectionOptions<SQLiteConnectionType> &
    SQLiteConnectionFactoryOptions<SQLiteConnectionType, ConnectionOptions>,
):
  | SQLiteAmbientClientPool<SQLiteConnectionType['driverType']>
  | SQLiteAmbientConnectionPool<SQLiteConnectionType['driverType']> {
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
