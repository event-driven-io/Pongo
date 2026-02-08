import {
  dumbo,
  JSONSerializer,
  resolveDatabaseMetadata,
} from '@event-driven-io/dumbo';
import {
  sqlite3DumboDriver as dumboDriver,
  SQLite3DriverType,
} from '@event-driven-io/dumbo/sqlite3';
import {
  PongoCollectionSchemaComponent,
  PongoDatabase,
  pongoDatabaseDriverRegistry,
  PongoDatabaseSchemaComponent,
  pongoSchema,
  type PongoDatabaseDriver,
  type PongoDatabaseDriverOptions,
  type PongoDb,
} from '../../../core';
import { pongoCollectionSQLiteMigrations, sqliteSQLBuilder } from '../core';

export type SQLitePongoClientOptions = object;

type SQLiteDatabaseDriverOptions =
  PongoDatabaseDriverOptions<SQLitePongoClientOptions> & {
    databaseName?: string | undefined;
    connectionString: string;
  };

const sqlite3DatabaseDriver: PongoDatabaseDriver<
  PongoDb<SQLite3DriverType>,
  SQLiteDatabaseDriverOptions
> = {
  driverType: SQLite3DriverType,
  databaseFactory: (options) => {
    const databaseName =
      options.databaseName ??
      resolveDatabaseMetadata(SQLite3DriverType)!.getDatabaseNameOrDefault(
        options.connectionString,
      );

    return PongoDatabase({
      ...options,
      pool: dumbo({
        connectionString: options.connectionString,
        driver: dumboDriver,
        ...options.connectionOptions,
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

export const useSqlite3DatabaseDriver = () => {
  pongoDatabaseDriverRegistry.register(
    SQLite3DriverType,
    sqlite3DatabaseDriver,
  );
};

useSqlite3DatabaseDriver();

export {
  sqlite3DatabaseDriver as databaseDriver,
  sqlite3DatabaseDriver as sqlite3Driver,
};
