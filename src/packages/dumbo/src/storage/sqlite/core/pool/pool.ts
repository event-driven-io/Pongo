import {
  InMemorySQLiteDatabase,
  SQLiteConnectionString,
  type AnySQLiteConnection,
  type SQLiteClientConnection,
  type SQLiteConnectionFactory,
  type SQLiteConnectionOptions,
  type SQLiteDriverType,
  type SQLitePoolClientConnection,
} from '..';
import {
  createAlwaysNewConnectionPool,
  createAmbientConnectionPool,
  createConnectionPool,
  createSingletonConnectionPool,
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

// export const sqliteSingletonClientPool = <
//   SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
//   ConnectionOptions extends
//     SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType> = SQLiteClientConnectionDefinitionOptions<SQLiteConnectionType>,
// >(
//   options: {
//     driverType: SQLiteConnectionType['driverType'];
//     database?: string | undefined;
//     allowNestedTransactions?: boolean;
//   } & SQLiteConnectionPoolDefinitionOptions<
//     SQLiteConnectionType,
//     ConnectionOptions
//   > &
//     ConnectionOptions,
// ): SQLiteAmbientClientPool<SQLiteConnectionType['driverType']> => {
//   const { driverType, sqliteConnectionFactory } = options;
//   let connection: SQLiteConnectionType | undefined = undefined;

//   const getConnection = () => {
//     if (connection) return connection;

//     const connect = async () => {
//       const client = sqliteClient(options);

//       await client.connect();

//       return client;
//     };

//     return (connection = sqliteConnectionFactory({
//       driverType,
//       type: 'Client',
//       connect,
//       transaction: {
//         allowNestedTransactions: options.allowNestedTransactions ?? false,
//       },
//       close: () => Promise.resolve(),
//     }));
//   };

//   const open = () => Promise.resolve(getConnection());
//   const close = async () => {
//     if (connection !== undefined) await connection.close();
//   };

//   return createConnectionPool({
//     driverType,
//     connection: open,
//     close,
//     getConnection,
//   });
// };

// export const sqliteAlwaysNewClientPool = <
//   SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
//   ConnectionOptions extends
//     SQLiteConnectionDefinitionOptions<SQLiteConnectionType> = SQLiteConnectionDefinitionOptions<SQLiteConnectionType>,
// >(
//   options: {
//     driverType: SQLiteConnectionType['driverType'];
//     database?: string | undefined;
//     allowNestedTransactions?: boolean;
//   } & SQLiteConnectionPoolDefinitionOptions<
//     SQLiteConnectionType,
//     ConnectionOptions
//   > &
//     ConnectionOptions,
// ): SQLiteAmbientClientPool<SQLiteConnectionType['driverType']> => {
//   const { driverType } = options;

//   const sqliteConnectionFactory = options.sqliteConnectionFactory; // ?? sqliteConnection;

//   return createConnectionPool({
//     driverType,
//     getConnection: () => {
//       return sqliteConnectionFactory(options);
//     },
//     // getConnection: () => {
//     //   const connect = async () => {
//     //     const client = sqliteClient(options);

//     //     await client.connect();

//     //     return client;
//     //   };

//     //   return sqliteConnection({
//     //     driverType,
//     //     type: 'Client',
//     //     connect,
//     //     transaction: {
//     //       allowNestedTransactions: allowNestedTransactions ?? false,
//     //     },
//     //     close: (client) => (client as SQLiteClientType).close(),
//     //   });
//     // },
//   });
// };

// export const sqliteAmbientClientPool = <
//   DriverType extends SQLiteDriverType = SQLiteDriverType,
// >(options: {
//   driverType: DriverType;
//   client: SQLiteClient;
// }): SQLiteAmbientClientPool<DriverType> => {
//   const { client, driverType } = options;

//   const getConnection = () => {
//     const connect = () => Promise.resolve(client);

//     return sqliteConnection({
//       driverType,
//       type: 'Client',
//       connect,
//       sqliteClient: () => client,
//       close: () => Promise.resolve(),
//     });
//   };

//   const open = () => Promise.resolve(getConnection());
//   const close = () => Promise.resolve();

//   return createConnectionPool({
//     driverType,
//     connection: open,
//     close,
//     getConnection,
//   });
// };

export type SQLiteFileNameOrConnectionString =
  | {
      fileName: string | SQLiteConnectionString;
      connectionString?: never;
    }
  | {
      connectionString: string | SQLiteConnectionString;
      fileName?: never;
    };

export const isInMemoryDatabase = (
  options: Record<string, unknown>,
): boolean => {
  if ('fileName' in options) {
    return options.fileName === InMemorySQLiteDatabase;
  }
  if ('connectionString' in options) {
    return options.connectionString === InMemorySQLiteDatabase;
  }
  return false;
};

type SQLiteAmbientPoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> = {
  singleton?: true;
  pooled?: false;
  sqliteConnectionFactory?: never;
  connection: SQLiteConnectionType;
  connectionOptions?: never;
};

type SQLiteSingletonPoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions = SQLiteConnectionOptions,
> = {
  singleton: true;
  pooled?: true;
  sqliteConnectionFactory: SQLiteConnectionFactory<
    SQLiteConnectionType,
    ConnectionOptions
  >;
  connection?: never;
  connectionOptions: ConnectionOptions;
};

type SQLiteAlwaysNewPoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions = SQLiteConnectionOptions,
> = {
  singleton?: false;
  pooled?: true;
  sqliteConnectionFactory: SQLiteConnectionFactory<
    SQLiteConnectionType,
    ConnectionOptions
  >;
  connection?: never;
  connectionOptions: ConnectionOptions;
};

export type SQLitePoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions = SQLiteConnectionOptions,
> = (
  | SQLiteAlwaysNewPoolOptions<SQLiteConnectionType, ConnectionOptions>
  | SQLiteSingletonPoolOptions<SQLiteConnectionType, ConnectionOptions>
  | SQLiteAmbientPoolOptions<SQLiteConnectionType>
) & {
  driverType: SQLiteConnectionType['driverType'];
  serializer?: JSONSerializer;
};

export type SQLitePoolFactoryOptions<
  SQLiteConnectionType extends AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions,
> = Omit<
  SQLitePoolOptions<SQLiteConnectionType, ConnectionOptions>,
  'singleton'
> & {
  singleton?: boolean;
};

export const toSqlitePoolOptions = <
  SQLiteConnectionType extends AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions,
>(
  options: SQLitePoolFactoryOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLitePoolOptions<SQLiteConnectionType, ConnectionOptions> => {
  const { singleton, ...rest } = options;
  const useSingleton = singleton ?? isInMemoryDatabase(options);

  if (useSingleton) {
    return { ...rest, singleton: true } as SQLitePoolOptions<
      SQLiteConnectionType,
      ConnectionOptions
    >;
  }
  return { ...rest, singleton: false } as SQLitePoolOptions<
    SQLiteConnectionType,
    ConnectionOptions
  >;
};

export function sqlitePool<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions = SQLiteConnectionOptions,
>(
  options: SQLitePoolOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLitePool<SQLiteConnectionType['driverType']> {
  const { driverType } = options;

  // TODO: Handle dates and bigints
  // setSQLiteTypeParser(serializer ?? JSONSerializer);

  if ('connection' in options && options.connection !== undefined)
    return createAmbientConnectionPool<SQLiteConnectionType>({
      driverType,
      connection: options.connection,
    });

  // After ambient check, we know we have factory options
  const { sqliteConnectionFactory, connectionOptions } = options as Exclude<
    typeof options,
    SQLiteAmbientPoolOptions<SQLiteConnectionType>
  >;

  if (options.singleton === true) {
    return createSingletonConnectionPool({
      driverType,
      getConnection: () => sqliteConnectionFactory(connectionOptions),
    });
  }

  return createAlwaysNewConnectionPool({
    driverType,
    getConnection: () => sqliteConnectionFactory(connectionOptions),
  });
}
