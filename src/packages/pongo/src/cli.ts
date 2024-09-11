#!/usr/bin/env node
// cli.ts
import {
  combineMigrations,
  dumbo,
  migrationTableSchemaComponent,
  runPostgreSQLMigrations,
  type SQLMigration,
} from '@event-driven-io/dumbo';
import { Command } from 'commander';
import { pongoCollectionSchemaComponent } from './core';

interface MigrateRunOptions {
  collection: string[];
  connectionString: string;
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
  .action(async (options: MigrateRunOptions) => {
    const { collection, connectionString } = options;

    if (!connectionString) {
      console.error(
        'Error: Connection string is required. Provide it either as a "cs" parameter or through the DB_CONNECTION_STRING environment variable.',
      );
      process.exit(1);
    }

    if (!collection) {
      console.error(
        'Error: You need to provide at least one collection name is required. Provide it either as a "col" parameter.',
      );
      process.exit(1);
    }

    const pool = dumbo({ connectionString });

    const migrations = collection.flatMap((collectionsName) =>
      pongoCollectionSchemaComponent(collectionsName).migrations({
        connector: 'PostgreSQL:pg', // TODO: Provide connector here
      }),
    );

    await runPostgreSQLMigrations(pool, migrations);
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
    const coreMigrations: SQLMigration[] =
      migrationTableSchemaComponent.migrations({
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

// Add the `migrate` command to the main program
program.addCommand(migrateCommand);

// Parse the command-line arguments
program.parse(process.argv);

export default program;
