import { dumbo } from '@event-driven-io/dumbo';
import {
  sqlite3DumboDriver as dumboDriver,
  SQLite3DriverType,
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

export type SQLitePongoClientOptions = object;

type SQLiteDatabaseDriverOptions =
  PongoDriverOptions<SQLitePongoClientOptions> & {
    databaseName?: string | undefined;
    connectionString: string;
  };

const sqlite3PongoDriver: PongoDriver<
  PongoDb<SQLite3DriverType>,
  SQLiteDatabaseDriverOptions
> = {
  driverType: SQLite3DriverType,
  dumboDriver,
  databaseFactory: (options) => {
    const { databaseName, defaultSchemaName } = options;
    const connectionOptions = withPongoTransactionOptions<
      SQLitePongoClientOptions,
      SQLiteTransactionOptions
    >(options.connectionOptions);

    return PongoDatabase({
      ...options,
      transactionOptions: connectionOptions.transactionOptions,
      pool: dumbo({
        connectionString: options.connectionString,
        driver: dumboDriver,
        ...connectionOptions,
        serialization: { serializer: options.serializer },
      }),
      sqlBuilderFor: (collection) =>
        sqliteSQLBuilder(collection, options.serializer),
      databaseName,
      defaultSchemaName,
    });
  },
};

export const useSqlite3PongoDriver = () => {
  pongoDriverRegistry.register(SQLite3DriverType, sqlite3PongoDriver);
};

useSqlite3PongoDriver();

export {
  sqlite3PongoDriver as pongoDriver,
  sqlite3PongoDriver as sqlite3Driver,
};
