import {
  InMemorySQLiteDatabase,
  sqliteClientProvider,
  sqliteConnection,
  SQLiteConnectionString,
  type SQLiteClient,
  type SQLiteClientConnection,
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
>(
  options: {
    driverType: DriverType;
    database?: string | undefined;
    allowNestedTransactions?: boolean;
  } & SQLiteFileNameOrConnectionString,
): SQLiteAmbientClientPool<DriverType> => {
  const { driverType } = options;
  let connection: SQLiteClientConnection | undefined = undefined;

  const getConnection = () => {
    if (connection) return connection;

    const connect = () =>
      sqliteClientProvider(driverType).then(async (sqliteClient) => {
        const client = sqliteClient(options);

        await client.connect();

        return client;
      });

    return (connection = sqliteConnection({
      driverType,
      type: 'Client',
      connect,
      allowNestedTransactions: options.allowNestedTransactions ?? false,
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
>(
  options: {
    driverType: DriverType;
    database?: string | undefined;
    allowNestedTransactions?: boolean;
  } & SQLiteFileNameOrConnectionString,
): SQLiteAmbientClientPool<DriverType> => {
  const { driverType, allowNestedTransactions } = options;

  return createConnectionPool({
    driverType,
    getConnection: () => {
      const connect = () =>
        sqliteClientProvider(driverType).then(async (sqliteClient) => {
          const client = sqliteClient(options);

          await client.connect();

          return client;
        });

      return sqliteConnection({
        driverType,
        type: 'Client',
        connect,
        allowNestedTransactions: allowNestedTransactions ?? false,
        close: (client) => client.close(),
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
      allowNestedTransactions,
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

export type SQLitePoolOptions<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
> = (
  | SQLitePoolPooledOptions<DriverType>
  | SQLitePoolNotPooledOptions<DriverType>
) & {
  serializer?: JSONSerializer;
} & SQLiteFileNameOrConnectionString;

export function sqlitePool<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
>(
  options: SQLitePoolNotPooledOptions<DriverType> &
    SQLiteFileNameOrConnectionString,
): SQLiteAmbientClientPool<DriverType>;

export function sqlitePool<
  DriverType extends SQLiteDriverType = SQLiteDriverType,
>(
  options: SQLitePoolOptions<DriverType>,
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
    options.fileName === InMemorySQLiteDatabase ||
    options.connectionString === InMemorySQLiteDatabase
  )
    return sqliteSingletonClientPool(options);

  return sqliteAlwaysNewClientPool(options);
}
