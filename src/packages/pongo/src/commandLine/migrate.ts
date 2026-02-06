import {
  combineMigrations,
  dumbo,
  JSONSerializer,
  parseConnectionString,
  runSQLMigrations,
  type DatabaseDriverType,
} from '@event-driven-io/dumbo';
import { Command } from 'commander';
import {
  pongoDatabaseDriverRegistry,
  pongoSchema,
  type AnyPongoDatabaseDriverOptions,
  type PongoCollectionSchema,
  type PongoDatabaseFactoryOptions,
  type PongoDocument,
} from '../core';
import { loadConfigFile } from './configFile';

interface MigrateRunOptions {
  collection: string[];
  connectionString: string;
  databaseType?: string;
  databaseName?: string | undefined;
  databaseDriver: string;
  config?: string;
  dryRun?: boolean;
}

interface MigrateSqlOptions {
  print?: boolean;
  write?: string;
  databaseType: string;
  databaseName?: string | undefined;
  databaseDriver: string;
  config?: string;
  collection: string[];
}

export const migrateCommand = new Command('migrate').description(
  'Manage database migrations',
);

migrateCommand
  .command('run')
  .description('Run database migrations')
  .option(
    '-dbt, --database-type <string>',
    'Database type that should be used for connection (e.g., PostgreSQL or SQLite)',
    undefined,
  )
  .option(
    '-drv, --database-driver <string>',
    'Database driver that should be used for connection (e.g., "pg" for PostgreSQL, "sqlite3" for SQLite)',
  )
  .option(
    '-dbn, --database-name <string>',
    'Database name to connect to',
    undefined,
  )
  .option(
    '-cs, --connection-string <string>',
    'Connection string for the database',
  )
  .option(
    '-col, --collection <name>',
    'Specify the collection name',
    (value: string, previous: string[]) => {
      // Accumulate collection names into an array (explicitly typing `previous` as `string[]`)
      return previous.concat([value]);
    },
    [] as string[],
  )
  .option('-f, --config <path>', 'Path to configuration file with Pongo config')
  .option('-dr, --dryRun', 'Perform dry run without commiting changes', false)
  .action(async (options: MigrateRunOptions) => {
    const { collection, dryRun, databaseName, databaseDriver } = options;
    const connectionString =
      options.connectionString ?? process.env.DB_CONNECTION_STRING;

    const databaseType =
      options.databaseType ??
      parseConnectionString(connectionString).databaseType;

    let collectionNames: string[];

    if (!connectionString) {
      console.error(
        'Error: Connection string is required. Provide it either as a "--connection-string" parameter or through the DB_CONNECTION_STRING environment variable.' +
          '\nFor instance: --connection-string postgresql://postgres:postgres@localhost:5432/postgres',
      );
      process.exit(1);
    }

    if (options.config) {
      const config = await loadConfigFile(options.config);

      collectionNames = config.collections.map((c) => c.name);
    } else if (collection) {
      collectionNames = collection;
    } else {
      console.error(
        'Error: You need to provide at least one collection name. Provide it either through "--config" file or as a "--collection" parameter.',
      );
      process.exit(1);
    }

    const driverType = `${databaseType}:${databaseDriver}` as const;

    const migrations = getMigrations({
      driverType,
      connectionString,
      databaseName,
      collectionNames,
    });

    const pool = dumbo({ connectionString, driverType });

    await runSQLMigrations(pool, migrations, {
      dryRun,
    });
  });

migrateCommand
  .command('sql')
  .description('Generate SQL for database migration')
  .option(
    '-dbt, --database-type <string>',
    'Database type that should be used for connection (e.g., PostgreSQL or SQLite)',
  )
  .option(
    '-drv, --database-driver <string>',
    'Database driver that should be used for connection (e.g., "pg" for PostgreSQL, "sqlite3" for SQLite)',
  )
  .option(
    '-dbn, --database-name <string>',
    'Database name to connect to',
    undefined,
  )
  .option(
    '-col, --collection <name>',
    'Specify the collection name',
    (value: string, previous: string[]) => {
      // Accumulate collection names into an array (explicitly typing `previous` as `string[]`)
      return previous.concat([value]);
    },
    [] as string[],
  )
  .option('-f, --config <path>', 'Path to configuration file with Pongo config')
  .option('--print', 'Print the SQL to the console (default)', true)
  //.option('--write <filename>', 'Write the SQL to a specified file')
  .action(async (options: MigrateSqlOptions) => {
    const { collection, databaseName, databaseType, databaseDriver } = options;

    let collectionNames: string[];

    if (options.config) {
      const config = await loadConfigFile(options.config);

      collectionNames = config.collections.map((c) => c.name);
    } else if (collection) {
      collectionNames = collection;
    } else {
      console.error(
        'Error: You need to provide at least one collection name. Provide it either through "--config" file or as a "--collection" parameter.',
      );
      process.exit(1);
    }

    const driverType = `${databaseType}:${databaseDriver}` as const;

    const migrations = getMigrations({
      driverType,
      connectionString: undefined,
      databaseName,
      collectionNames,
    });

    console.log('Printing SQL:');
    console.log(combineMigrations(...migrations));
  });

const getMigrations = ({
  driverType,
  connectionString,
  databaseName,
  collectionNames,
}: {
  driverType: DatabaseDriverType;
  connectionString: string | undefined;
  databaseName: string | undefined;
  collectionNames: string[];
}) => {
  const driver = pongoDatabaseDriverRegistry.tryGet(driverType);

  if (driver === null) {
    console.error(
      `Error: No database driver found for driver type "${driverType}". Make sure the driver is registered and the connection string is correct.`,
    );
    process.exit(1);
  }

  const dbDefinition = pongoSchema.db.from(databaseName, collectionNames);

  const driverOptions: PongoDatabaseFactoryOptions<
    Record<string, PongoCollectionSchema<PongoDocument>>,
    AnyPongoDatabaseDriverOptions
  > = {
    schema: { definition: dbDefinition },
    serializer: JSONSerializer,
  };

  const customOptions = {
    connectionString,
    databaseName,
  };

  const db = driver.databaseFactory({ ...driverOptions, ...customOptions });

  return db.schema.component.migrations;
};
