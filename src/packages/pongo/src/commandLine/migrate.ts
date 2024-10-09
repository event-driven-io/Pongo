import {
  combineMigrations,
  dumbo,
  migrationTableSchemaComponent,
  runPostgreSQLMigrations,
} from '@event-driven-io/dumbo';
import { Command } from 'commander';
import { pongoCollectionSchemaComponent } from '../core';
import { loadConfigFile } from './configFile';

interface MigrateRunOptions {
  collection: string[];
  connectionString: string;
  config?: string;
  dryRun?: boolean;
}

interface MigrateSqlOptions {
  print?: boolean;
  write?: string;
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

    const pool = dumbo({ connectionString });

    const migrations = collectionNames.flatMap((collectionsName) =>
      pongoCollectionSchemaComponent(collectionsName).migrations({
        connector: 'PostgreSQL:pg', // TODO: Provide connector here
      }),
    );

    await runPostgreSQLMigrations(pool, migrations, {
      dryRun,
    });
  });

migrateCommand
  .command('sql')
  .description('Generate SQL for database migration')
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

    const coreMigrations = migrationTableSchemaComponent.migrations({
      connector: 'PostgreSQL:pg',
    });
    const migrations = [
      ...coreMigrations,
      ...collectionNames.flatMap((collectionName) =>
        pongoCollectionSchemaComponent(collectionName).migrations({
          connector: 'PostgreSQL:pg', // TODO: Provide connector here
        }),
      ),
    ];

    console.log('Printing SQL:');
    console.log(combineMigrations(...migrations));
  });
