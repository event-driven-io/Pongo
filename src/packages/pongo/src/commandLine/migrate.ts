import {
  combineMigrations,
  dumbo,
  parseConnectionString,
  runSQLMigrations,
  type DatabaseType,
} from '@event-driven-io/dumbo';
import { Command } from 'commander';
import {
  pongoDatabaseDriverRegistry,
  pongoSchema,
  type PongoCollectionSchema,
  type PongoDb,
} from '../core';
import { loadConfigFile } from './configFile';

interface MigrateRunOptions {
  collection: string[];
  connectionString: string;
  databaseDriver: string;
  config?: string;
  dryRun?: boolean;
}

interface MigrateSqlOptions {
  print?: boolean;
  write?: string;
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
    '-drv, --database-driver <string>',
    'Database driver that should be used for connection (e.g., "pg" for PostgreSQL, "sqlite3" for SQLite)',
    'pg',
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
    const { collection, dryRun } = options;
    const connectionString =
      options.connectionString ?? process.env.DB_CONNECTION_STRING;
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

    const { databaseType } = parseConnectionString(connectionString);
    const connector = `${databaseType}:${options.databaseDriver}` as const;

    const driver = pongoDatabaseDriverRegistry.tryGet(connector);

    if (driver === null) {
      console.error(
        `Error: No database driver found for connector "${connector}". Make sure the driver is installed and the connector string is correct.`,
      );
      process.exit(1);
    }

    const databaseName: string | undefined = undefined;

    const dbDefinition = pongoSchema.db(
      collectionNames.reduce(
        (acc, collectionName) => (
          (acc[collectionName] = pongoSchema.collection(collectionName)), acc
        ),
        {} as Record<string, PongoCollectionSchema>,
      ),
    );

    const db = driver.databaseFactory({
      connectionString,
      databaseName,
      schema: { definition: dbDefinition },
    }) as PongoDb;

    const pool = dumbo({ connectionString, connector });

    const migrations = db.schema.component.migrations;

    await runSQLMigrations(pool, migrations, {
      dryRun,
    });
  });

migrateCommand
  .command('sql')
  .description('Generate SQL for database migration')
  .option(
    '-drv, --database-driver <string>',
    'Database driver that should be used for connection (e.g., "pg" for PostgreSQL, "sqlite3" for SQLite)',
    'pg',
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
    const { collection } = options;

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
    // TODO: Provide connector here
    const databaseType: DatabaseType = 'PostgreSQL';
    const connector = `${databaseType}:${options.databaseDriver}` as const;

    const driver = pongoDatabaseDriverRegistry.tryGet(connector);

    if (driver === null) {
      console.error(
        `Error: No database driver found for connector "${connector}". Make sure the driver is installed and the connector string is correct.`,
      );
      process.exit(1);
    }

    const databaseName: string | undefined = undefined;

    const dbDefinition = pongoSchema.db(
      collectionNames.reduce(
        (acc, collectionName) => (
          (acc[collectionName] = pongoSchema.collection(collectionName)), acc
        ),
        {} as Record<string, PongoCollectionSchema>,
      ),
    );

    const connectionString = 'DRIVER_PLACEHOLDER'; // TODO: replace with getting database schema without connection

    const db = driver.databaseFactory({
      connectionString,
      databaseName,
      schema: { definition: dbDefinition },
    }) as PongoDb;

    const migrations = db.schema.component.migrations;

    console.log('Printing SQL:');
    console.log(combineMigrations(...migrations));
  });
