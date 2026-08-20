import type {
  DumboConnectionOptions,
  JSONSerializer,
} from '@event-driven-io/dumbo';
import {
  sqlite3DumboDriver as dumboDriver,
  sqlite3Pool,
  SQLite3DriverType,
  type SQLiteConnectionString,
  type SQLiteTransactionOptions,
} from '@event-driven-io/dumbo/sqlite3';
import {
  PongoDatabase,
  pongoDriverRegistry,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import { sqliteSQLBuilder } from '../core';

export type SQLite3DatabaseDriverOptions = PongoDriverOptions<
  typeof dumboDriver
> & {
  databaseName?: string | undefined;
  connectionString: string | SQLiteConnectionString;
};

const sqlite3PongoDriver: PongoDriver<
  PongoDb<SQLite3DriverType>,
  typeof dumboDriver,
  SQLite3DatabaseDriverOptions
> = {
  driverType: SQLite3DriverType,
  dumboDriver,
  databaseFactory: (options) => {
    const { databaseName, defaultSchemaName } = options;
    const { transactionOptions } = withPongoTransactionOptions<
      DumboConnectionOptions<typeof dumboDriver>,
      SQLiteTransactionOptions
    >(options.connectionOptions);

    return PongoDatabase({
      ...options,
      transactionOptions,
      pool: options.pool ?? createSqlite3Pool(options, options.serializer),
      sqlBuilderFor: (collection) =>
        sqliteSQLBuilder(collection, options.serializer),
      databaseName,
      defaultSchemaName,
    });
  },
};

const createSqlite3Pool = (
  options: SQLite3DatabaseDriverOptions,
  serializer: JSONSerializer,
): ReturnType<typeof sqlite3Pool> => {
  const { connectionOptions, connectionString } = options;
  const transactionOptions =
    withPongoTransactionOptions(connectionOptions).transactionOptions;

  if (connectionOptions && 'connection' in connectionOptions) {
    return sqlite3Pool({
      ...connectionOptions,
      transactionOptions,
      serializer,
    });
  }

  if (connectionOptions && 'fileName' in connectionOptions) {
    return sqlite3Pool({
      ...connectionOptions,
      transactionOptions,
      serializer,
    });
  }

  return sqlite3Pool({
    connectionString,
    ...connectionOptions,
    transactionOptions,
    serializer,
  });
};

export const useSqlite3PongoDriver = () => {
  pongoDriverRegistry.register(SQLite3DriverType, sqlite3PongoDriver);
};

useSqlite3PongoDriver();

export {
  sqlite3PongoDriver as pongoDriver,
  sqlite3PongoDriver as sqlite3Driver,
};
