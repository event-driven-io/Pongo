import { dumbo, JSONSerializer } from '@event-driven-io/dumbo';
import {
  sqlite3DumboDriver as dumboDriver,
  SQLite3DriverType,
  type SQLiteTransactionOptions,
} from '@event-driven-io/dumbo/sqlite3';
import {
  PongoCollectionSchemaComponent,
  PongoDatabase,
  PongoDatabaseSchemaComponent,
  pongoDriverRegistry,
  pongoSchema,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
  withPongoTransactionOptions,
} from '../../../core';
import { pongoCollectionSQLiteMigrations, sqliteSQLBuilder } from '../core';

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
  databaseFactory: (options) => {
    const databaseName = options.databaseName ?? 'db:default';
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
      schemaComponent: PongoDatabaseSchemaComponent({
        driverType: SQLite3DriverType,
        collectionFactory: (schema) =>
          PongoCollectionSchemaComponent({
            driverType: SQLite3DriverType,
            definition: schema,
            migrationsOrSchemaComponents: {
              migrations: pongoCollectionSQLiteMigrations(schema.name),
            },
            sqlBuilder: sqliteSQLBuilder(
              schema.name,
              options.serialization?.serializer ?? JSONSerializer,
            ),
          }),
        definition:
          options.schema?.definition ?? pongoSchema.db(databaseName, {}),
      }),
      databaseName,
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
