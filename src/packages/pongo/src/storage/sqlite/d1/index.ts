import type { D1Database } from '@cloudflare/workers-types';
import { D1DriverType, d1Pool } from '@event-driven-io/dumbo/d1';
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

type D1DatabaseDriverOptions = PongoDatabaseDriverOptions<never> & {
  database: D1Database;
};

const d1DatabaseDriver: PongoDatabaseDriver<
  PongoDb<D1DriverType>,
  D1DatabaseDriverOptions
> = {
  driverType: D1DriverType,
  databaseFactory: (options) => {
    const databaseName = 'd1:default';

    return PongoDatabase({
      ...options,
      pool: d1Pool({ database: options.database }),
      schemaComponent: PongoDatabaseSchemaComponent({
        driverType: D1DriverType,
        collectionFactory: (schema) =>
          PongoCollectionSchemaComponent({
            driverType: D1DriverType,
            definition: schema,
            migrationsOrSchemaComponents: {
              migrations: pongoCollectionSQLiteMigrations(schema.name),
            },
            sqlBuilder: sqliteSQLBuilder(schema.name),
          }),
        definition:
          options.schema?.definition ?? pongoSchema.db(databaseName, {}),
      }),
      databaseName,
    });
  },
  getDatabaseNameOrDefault: () => {
    return 'd1://default';
  },
  defaultConnectionString: 'd1://default',
};

export const useSqlite3DatabaseDriver = () => {
  pongoDatabaseDriverRegistry.register(D1DriverType, d1DatabaseDriver);
};

useSqlite3DatabaseDriver();

export { d1DatabaseDriver as d1Driver, d1DatabaseDriver as databaseDriver };
