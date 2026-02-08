import {
  JSONSerializer,
  resolveDatabaseMetadata,
} from '@event-driven-io/dumbo';
import type { D1PoolOptions } from '@event-driven-io/dumbo/cloudflare';
import { D1DriverType, d1Pool } from '@event-driven-io/dumbo/cloudflare';
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

type D1DatabaseDriverOptions = PongoDatabaseDriverOptions<never> &
  D1PoolOptions;

const d1DatabaseDriver: PongoDatabaseDriver<
  PongoDb<D1DriverType>,
  D1DatabaseDriverOptions
> = {
  driverType: D1DriverType,
  databaseFactory: (options) => {
    const databaseName =
      resolveDatabaseMetadata(D1DriverType)!.getDatabaseNameOrDefault();

    return PongoDatabase({
      ...options,
      pool: d1Pool(options),
      schemaComponent: PongoDatabaseSchemaComponent({
        driverType: D1DriverType,
        collectionFactory: (schema) =>
          PongoCollectionSchemaComponent({
            driverType: D1DriverType,
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
  pongoDatabaseDriverRegistry.register(D1DriverType, d1DatabaseDriver);
};

useSqlite3DatabaseDriver();

export { d1DatabaseDriver as d1Driver, d1DatabaseDriver as databaseDriver };
