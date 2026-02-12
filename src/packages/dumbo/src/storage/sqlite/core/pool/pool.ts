import type { SQLiteConnectionString } from '..';
import {
  InMemorySQLiteDatabase,
  type AnySQLiteConnection,
  type SQLiteConnectionFactory,
  type SQLiteConnectionOptions,
} from '..';
import type { JSONSerializer } from '../../../../core';
import {
  createAlwaysNewConnectionPool,
  createAmbientConnectionPool,
  createSingletonConnectionPool,
  type ConnectionPool,
} from '../../../../core';
import {
  sqliteDualConnectionPool,
  type SQLiteDualPoolOptions,
} from './dualPool';

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

export type SQLiteAmbientConnectionPool<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> = ConnectionPool<SQLiteConnectionType>;

type SQLiteAmbientConnectionPoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> = {
  singleton?: true;
  pooled?: false;
  sqliteConnectionFactory?: never;
  connection: SQLiteConnectionType;
  connectionOptions?: never;
};

export const sqliteAmbientConnectionPool = <
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
>(
  options: {
    driverType: SQLiteConnectionType['driverType'];
  } & SQLiteAmbientConnectionPoolOptions<SQLiteConnectionType['driverType']>,
): SQLiteAmbientConnectionPool<SQLiteConnectionType['driverType']> => {
  const { connection, driverType } = options;

  return createAmbientConnectionPool<SQLiteConnectionType>({
    driverType,
    connection: connection,
  }) as unknown as SQLiteAmbientConnectionPool<
    SQLiteConnectionType['driverType']
  >;
};

type SQLiteSingletonConnectionPoolOptions<
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

export type SQLiteSingletonConnectionPool<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> = ConnectionPool<SQLiteConnectionType>;

export const sqliteSingletonConnectionPool = <
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions & Record<string, unknown> =
    SQLiteConnectionOptions & Record<string, unknown>,
>(
  options: {
    driverType: SQLiteConnectionType['driverType'];
  } & SQLiteSingletonConnectionPoolOptions<
    SQLiteConnectionType,
    ConnectionOptions
  >,
): SQLiteSingletonConnectionPool<SQLiteConnectionType> => {
  const { driverType, sqliteConnectionFactory, connectionOptions } = options;

  return createSingletonConnectionPool<SQLiteConnectionType>({
    driverType,
    getConnection: () => sqliteConnectionFactory(connectionOptions),
  }) as unknown as SQLiteSingletonConnectionPool<SQLiteConnectionType>;
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

export type SQLiteAlwaysNewConnectionPool<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> = ConnectionPool<SQLiteConnectionType>;

export const sqliteAlwaysNewConnectionPool = <
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions & Record<string, unknown> =
    SQLiteConnectionOptions & Record<string, unknown>,
>(
  options: {
    driverType: SQLiteConnectionType['driverType'];
  } & SQLiteAlwaysNewPoolOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLiteAlwaysNewConnectionPool<SQLiteConnectionType> => {
  const { driverType, sqliteConnectionFactory, connectionOptions } = options;

  return createAlwaysNewConnectionPool<SQLiteConnectionType>({
    driverType,
    getConnection: () => sqliteConnectionFactory(connectionOptions),
  }) as unknown as SQLiteAlwaysNewConnectionPool<SQLiteConnectionType>;
};

export type SQLitePoolOptions<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions = SQLiteConnectionOptions,
> = (
  | SQLiteAlwaysNewPoolOptions<SQLiteConnectionType, ConnectionOptions>
  | SQLiteSingletonConnectionPoolOptions<
      SQLiteConnectionType,
      ConnectionOptions
    >
  | SQLiteAmbientConnectionPoolOptions<SQLiteConnectionType>
  | SQLiteDualPoolOptions<SQLiteConnectionType, ConnectionOptions>
) & {
  driverType: SQLiteConnectionType['driverType'];
  serializer?: JSONSerializer;
};

export type SQLitePool<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
> =
  | SQLiteAmbientConnectionPool<SQLiteConnectionType>
  | SQLiteSingletonConnectionPool<SQLiteConnectionType>
  | SQLiteAlwaysNewConnectionPool<SQLiteConnectionType>;

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
  const isInMemory = isInMemoryDatabase(options);

  if (isInMemory) {
    return { ...rest, singleton: true } as SQLitePoolOptions<
      SQLiteConnectionType,
      ConnectionOptions
    >;
  }

  if (singleton === true) {
    return { ...rest, singleton: true } as SQLitePoolOptions<
      SQLiteConnectionType,
      ConnectionOptions
    >;
  }

  return { ...rest, dual: true } as SQLitePoolOptions<
    SQLiteConnectionType,
    ConnectionOptions
  >;
};

export function sqlitePool<
  SQLiteConnectionType extends AnySQLiteConnection = AnySQLiteConnection,
  ConnectionOptions extends SQLiteConnectionOptions = SQLiteConnectionOptions,
>(
  options: SQLitePoolOptions<SQLiteConnectionType, ConnectionOptions>,
): SQLitePool<SQLiteConnectionType> {
  const { driverType } = options;

  // TODO: Handle dates and bigints
  // setSQLiteTypeParser(serializer ?? JSONSerializer);

  if (
    (
      options as SQLiteAmbientConnectionPoolOptions<SQLiteConnectionType> & {
        driverType: SQLiteConnectionType['driverType'];
      }
    ).connection
  )
    return createAmbientConnectionPool<SQLiteConnectionType>({
      driverType,
      connection: (
        options as SQLiteAmbientConnectionPoolOptions<SQLiteConnectionType> & {
          driverType: SQLiteConnectionType['driverType'];
        }
      ).connection,
    });

  if ('dual' in options && options.dual) {
    return sqliteDualConnectionPool(
      options as SQLiteDualPoolOptions<SQLiteConnectionType, ConnectionOptions>,
    );
  }

  if (
    options.singleton === true &&
    (
      options as SQLiteSingletonConnectionPoolOptions<
        SQLiteConnectionType,
        ConnectionOptions
      > & { driverType: SQLiteConnectionType['driverType'] }
    ).sqliteConnectionFactory
  ) {
    return createSingletonConnectionPool({
      driverType,
      getConnection: () =>
        (
          options as SQLiteSingletonConnectionPoolOptions<
            SQLiteConnectionType,
            ConnectionOptions
          > & { driverType: SQLiteConnectionType['driverType'] }
        ).sqliteConnectionFactory(
          (
            options as SQLiteSingletonConnectionPoolOptions<
              SQLiteConnectionType,
              ConnectionOptions
            > & { driverType: SQLiteConnectionType['driverType'] }
          ).connectionOptions,
        ),
    });
  }

  return createAlwaysNewConnectionPool({
    driverType,
    getConnection: () =>
      (
        options as SQLiteAlwaysNewPoolOptions<
          SQLiteConnectionType,
          ConnectionOptions
        > & { driverType: SQLiteConnectionType['driverType'] }
      ).sqliteConnectionFactory(
        (
          options as SQLiteAlwaysNewPoolOptions<
            SQLiteConnectionType,
            ConnectionOptions
          > & { driverType: SQLiteConnectionType['driverType'] }
        ).connectionOptions,
      ),
  });
}
