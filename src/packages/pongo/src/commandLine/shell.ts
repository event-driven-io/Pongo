import { JSONSerializer } from '@event-driven-io/dumbo';
import chalk from 'chalk';
import Table from 'cli-table3';
import { Command } from 'commander';
import repl from 'node:repl';
import { pongoClient, pongoSchema, type PongoClient } from '../core';

let pongo: PongoClient;

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
const printOutput = (obj: any): string => {
  return Array.isArray(obj)
    ? displayResultsAsTable(obj)
    : JSONSerializer.serialize(obj);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const displayResultsAsTable = (results: any[]): string => {
  if (results.length === 0) {
    return chalk.yellow('No documents found.');
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

  return table.toString();
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
    breakEvalOnSigint: true,
    writer: printOutput,
  });

  const schema =
    options.schema.collections.length > 0
      ? pongoSchema.client({
          database: pongoSchema.db({
            users: pongoSchema.collection(options.schema.database),
          }),
        })
      : undefined;

  pongo = pongoClient(options.connectionString, {
    ...(schema ? { schema: { definition: schema } } : {}),
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const db = schema
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (pongo as any).database
    : pongo.db(options.schema.database);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  r.context.db = db;

  // Intercept REPL output to display results as a table if they are arrays
  r.on('exit', async () => {
    await teardown();
    process.exit();
  });
};

const teardown = async () => {
  console.log(chalk.yellow('Exiting Pongo Shell...'));
  await pongo.close();
};

process.on('uncaughtException', teardown);
process.on('SIGINT', teardown);

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
