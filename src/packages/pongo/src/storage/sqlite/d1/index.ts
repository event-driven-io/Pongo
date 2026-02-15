import { JSONSerializer } from '@event-driven-io/dumbo';
import type { D1PoolOptions } from '@event-driven-io/dumbo/cloudflare';
import { D1DriverType, d1Pool } from '@event-driven-io/dumbo/cloudflare';
import {
  PongoCollectionSchemaComponent,
  PongoDatabase,
  PongoDatabaseSchemaComponent,
  pongoDriverRegistry,
  pongoSchema,
  type PongoDb,
  type PongoDriver,
  type PongoDriverOptions,
} from '../../../core';
import { pongoCollectionSQLiteMigrations, sqliteSQLBuilder } from '../core';

export type SQLitePongoClientOptions = object;

type D1DatabaseDriverOptions = PongoDriverOptions<never> & D1PoolOptions;

const d1PongoDriver: PongoDriver<
  PongoDb<D1DriverType>,
  D1DatabaseDriverOptions
> = {
  driverType: D1DriverType,
  databaseFactory: (options) => {
    const databaseName = options.databaseName ?? 'db:default';

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

export const useD1PongoDriver = () => {
  pongoDriverRegistry.register(D1DriverType, d1PongoDriver);
};

useD1PongoDriver();

export { d1PongoDriver as d1Driver, d1PongoDriver as pongoDriver };
