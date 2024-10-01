import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import repl from 'node:repl';
import { pongoClient, pongoSchema } from '../core';

const calculateColumnWidths = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results: any[],
  columnNames: string[],
): number[] => {
  const columnWidths = columnNames.map((col) => {
    const maxWidth = Math.max(
      col.length, // Header size
      ...results.map((result) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        result[col] ? String(result[col]).length : 0,
      ),
    );
    return maxWidth + 2; // Add padding
  });
  return columnWidths;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const displayResultsAsTable = (results: any[]) => {
  if (results.length === 0) {
    console.log(chalk.yellow('No documents found.'));
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const columnNames = Object.keys(results[0]);

  const columnWidths = calculateColumnWidths(results, columnNames);

  const table = new Table({
    head: columnNames.map((col) => chalk.cyan(col)),
    colWidths: columnWidths,
  });

  results.forEach((result) => {
    table.push(
      columnNames.map((col) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        result[col] !== undefined ? String(result[col]) : '',
      ),
    );
  });

  console.log(table.toString());
};

const startRepl = (options: {
  schema: {
    database: string;
    collections: string[];
  };
  connectionString: string;
}) => {
  const r = repl.start({
    prompt: chalk.green('pongo> '),
    useGlobal: true,
  });

  const schema =
    options.schema.collections.length > 0
      ? pongoSchema.client({
          database: pongoSchema.db({
            users: pongoSchema.collection(options.schema.database),
          }),
        })
      : undefined;

  const pongo = pongoClient(options.connectionString, {
    ...(schema ? { schema: { definition: schema } } : {}),
  });

  // Expose the db object to the REPL context
  r.context.db = schema ? pongo.database : pongo.db(options.schema.database);

  // Handle default output formatting
  r.context.displayResults = displayResultsAsTable;

  // Intercept REPL output to display results as a table if they are arrays
  r.on('exit', () => {
    console.log(chalk.yellow('Exiting Pongo Shell...'));
    process.exit();
  });
};

interface ShellOptions {
  database: string;
  collection: string[];
  connectionString: string;
}

const shellCommand = new Command('shell')
  .description('Start an interactive Pongo shell')
  .option(
    '-cs, --connectionString <string>',
    'Connection string for the database',
    'postgresql://postgres:postgres@localhost:5432/postgres',
  )
  .option('-db, --database <string>', 'Database name to connect', 'postgres')
  .option(
    '-col, --collection <name>',
    'Specify the collection name',
    (value: string, previous: string[]) => {
      // Accumulate collection names into an array (explicitly typing `previous` as `string[]`)
      return previous.concat([value]);
    },
    [] as string[],
  )
  .action((options: ShellOptions) => {
    const { collection, database } = options;
    const connectionString =
      options.connectionString ?? process.env.DB_CONNECTION_STRING;

    console.log(
      chalk.green(
        'Starting Pongo Shell. Use db.<collection>.<method>() to query.',
      ),
    );
    startRepl({
      schema: { collections: collection, database },
      connectionString,
    });
  });

export { shellCommand };
