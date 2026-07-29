import { dumbo } from '@event-driven-io/dumbo';
import {
  sqlite3DumboDriver as dumboDriver,
  SQLite3DriverType,
  type SQLiteTransactionOptions,
} from '@event-driven-io/dumbo/sqlite3';
import { sqliteTableReference } from '@event-driven-io/dumbo/sqlite';
import {
  PongoDatabase,
  pongoDriverRegistry,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import { pongoSQLiteMigrationBuilder, sqliteSQLBuilder } from '../core';

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
      migrationBuilder: pongoSQLiteMigrationBuilder,
      sqlBuilderFor: (collection, identifier) => {
        const referenceFor = (tableName: string) =>
          sqliteTableReference({ ...identifier, tableName });
        return sqliteSQLBuilder(
          collection,
          referenceFor(identifier.tableName),
          referenceFor,
          options.serializer,
        );
      },
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
