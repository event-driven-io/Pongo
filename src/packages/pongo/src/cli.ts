#!/usr/bin/env node
import {
  combineMigrations,
  dumbo,
  migrationTableSchemaComponent,
  runPostgreSQLMigrations,
} from '@event-driven-io/dumbo';
import { Command } from 'commander';
import { pongoCollectionSchemaComponent, type PongoSchemaConfig } from './core';

interface MigrateRunOptions {
  collection: string[];
  connectionString: string;
  config?: string;
  dryRun?: boolean;
}

interface MigrateSqlOptions {
  print?: boolean;
  write?: string;
  collection: string[];
}

const program = new Command();

program.name('pongo').description('CLI tool for Pongo');

const migrateCommand = new Command('migrate').description(
  'Manage database migrations',
);

/// Add `migrate:run` subcommand
migrateCommand
  .command('run')
  .description('Run database migrations')
  .option(
    '-cs, --connectionString <string>',
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
  .option(
    '-f, --config <path>',
    'Path to configuration file with collection list',
  )
  .option('-dr, --dryRun', 'Perform dry run without commiting changes', false)
  .action(async (options: MigrateRunOptions) => {
    const { collection, connectionString, dryRun } = options;
    let collectionNames: string[];

    if (!connectionString) {
      console.error(
        'Error: Connection string is required. Provide it either as a "cs" parameter or through the DB_CONNECTION_STRING environment variable.',
      );
      process.exit(1);
    }

    if (options.config) {
      const config = await loadConfigFile(options.config);
      collectionNames = config.collections;
    } else if (collection) {
      collectionNames = collection;
    } else {
      console.error(
        'Error: You need to provide at least one collection name is required. Provide it either through "config" file or as a "col" parameter.',
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

// Add `migrate:sql` subcommand
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
  .option('--print', 'Print the SQL to the console (default)', true)
  //.option('--write <filename>', 'Write the SQL to a specified file')
  .action((options: MigrateSqlOptions) => {
    const { collection } = options;

    if (!collection) {
      console.error(
        'Error: You need to provide at least one collection name is required. Provide it either as a "col" parameter.',
      );
      process.exit(1);
    }
    const coreMigrations = migrationTableSchemaComponent.migrations({
      connector: 'PostgreSQL:pg',
    });
    const migrations = [
      ...coreMigrations,
      ...collection.flatMap((collectionsName) =>
        pongoCollectionSchemaComponent(collectionsName).migrations({
          connector: 'PostgreSQL:pg', // TODO: Provide connector here
        }),
      ),
    ];

    console.log('Printing SQL:');
    console.log(combineMigrations(...migrations));
  });

const loadConfigFile = async (
  configPath: string,
): Promise<PongoSchemaConfig> => {
  const configUrl = new URL(configPath, `file://${process.cwd()}/`);
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const imported: Partial<{ default: PongoSchemaConfig }> = await import(
      configUrl.href
    );

    if (!imported.default) {
      console.error(
        'Error: Config should contain default export with object with collections array',
      );
      process.exit(1);
    }

    if (
      !(
        imported.default.collections &&
        Array.isArray(imported.default.collections)
      )
    ) {
      console.error('Error: Config file should contain collections array');
      process.exit(1);
    }

    console.log(JSON.stringify(imported));

    return { collections: imported.default.collections };
  } catch {
    console.error(`Error: Couldn't load file: ${configUrl.href}`);
    process.exit(1);
  }
};

// Add the `migrate` command to the main program
program.addCommand(migrateCommand);

// Parse the command-line arguments
program.parse(process.argv);

export default program;
