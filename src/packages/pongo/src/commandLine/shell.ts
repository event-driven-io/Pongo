import {
  checkConnection,
  color,
  LogLevel,
  LogStyle,
  prettyJson,
  SQL,
  type MigrationStyle,
} from '@event-driven-io/dumbo';
import Table from 'cli-table3';
import { Command } from 'commander';
import repl from 'node:repl';
import {
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoCollectionSchema,
  type PongoDb,
} from '../core';

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

let shouldDisplayResultsAsTable = false;

const printResultsAsTable = (print?: boolean) =>
  (shouldDisplayResultsAsTable = print === undefined || print === true);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const printOutput = (obj: any): string =>
  Array.isArray(obj) && shouldDisplayResultsAsTable
    ? displayResultsAsTable(obj)
    : prettyJson(obj);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const displayResultsAsTable = (results: any[]): string => {
  if (results.length === 0) {
    return color.yellow('No documents found.');
  }

  const columnNames = results

    .flatMap((result) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      typeof result === 'object' ? Object.keys(result) : typeof result,
    )
    .filter((value, index, array) => array.indexOf(value) === index);

  const columnWidths = calculateColumnWidths(results, columnNames);

  const table = new Table({
    head: columnNames.map((col) => color.cyan(col)),
    colWidths: columnWidths,
  });

  results.forEach((result) => {
    table.push(
      columnNames.map((col) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        result[col] !== undefined
          ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            Array.isArray(result[col])
            ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              displayResultsAsTable(result[col])
            : // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              prettyJson(result[col])
          : typeof result === 'object'
            ? ''
            : result != undefined && result != undefined
              ? prettyJson(result)
              : '',
      ),
    );
  });

  return table.toString();
};

const setLogLevel = (logLevel: string) => {
  process.env.DUMBO_LOG_LEVEL = logLevel;
};

const setLogStyle = (logLevel: string) => {
  process.env.DUMBO_LOG_STYLE = logLevel;
};

const prettifyLogs = (logLevel?: string) => {
  if (logLevel !== undefined) setLogLevel(logLevel);
  setLogStyle(LogStyle.PRETTY);
};

const startRepl = async (options: {
  logging: {
    printOptions: boolean;
    logLevel: LogLevel;
    logStyle: LogStyle;
  };
  schema: {
    database: string;
    collections: string[];
    autoMigration: MigrationStyle;
  };
  connectionString: string | undefined;
}) => {
  // TODO: This will change when we have proper tracing and logging config
  // For now, that's enough
  setLogLevel(process.env.DUMBO_LOG_LEVEL ?? options.logging.logLevel);
  setLogStyle(process.env.DUMBO_LOG_STYLE ?? options.logging.logStyle);

  console.log(color.green('Starting Pongo Shell (version: 0.16.4)'));

  if (options.logging.printOptions) {
    console.log(color.green('With Options:'));
    console.log(prettyJson(options));
  }

  const connectionString =
    options.connectionString ??
    process.env.DB_CONNECTION_STRING ??
    'postgresql://postgres:postgres@localhost:5432/postgres';

  if (!(options.connectionString ?? process.env.DB_CONNECTION_STRING)) {
    console.log(
      color.yellow(
        `No connection string provided, using: 'postgresql://postgres:postgres@localhost:5432/postgres'`,
      ),
    );
  }

  const connectionCheck = await checkConnection(connectionString);

  if (!connectionCheck.successful) {
    if (connectionCheck.errorType === 'ConnectionRefused') {
      console.error(
        color.red(
          `Connection was refused. Check if the PostgreSQL server is running and accessible.`,
        ),
      );
    } else if (connectionCheck.errorType === 'Authentication') {
      console.error(
        color.red(
          `Authentication failed. Check the username and password in the connection string.`,
        ),
      );
    } else {
      console.error(color.red('Error connecting to PostgreSQL server'));
    }
    console.log(color.red('Exiting Pongo Shell...'));
    process.exit();
  }

  console.log(color.green(`Successfully connected`));
  console.log(color.green('Use db.<collection>.<method>() to query.'));

  const shell = repl.start({
    prompt: color.green('pongo> '),
    useGlobal: true,
    breakEvalOnSigint: true,
    writer: printOutput,
  });

  let db: PongoDb;

  if (options.schema.collections.length > 0) {
    const collectionsSchema: Record<string, PongoCollectionSchema> = {};

    for (const collectionName of options.schema.collections) {
      collectionsSchema[collectionName] =
        pongoSchema.collection(collectionName);
    }

    const schema = pongoSchema.client({
      database: pongoSchema.db(options.schema.database, collectionsSchema),
    });

    const typedClient = pongoClient(connectionString, {
      schema: {
        definition: schema,
        autoMigration: options.schema.autoMigration,
      },
    });

    db = typedClient.database;

    for (const collectionName of options.schema.collections) {
      shell.context[collectionName] = typedClient.database[collectionName];
    }

    pongo = typedClient;
  } else {
    pongo = pongoClient(connectionString, {
      schema: { autoMigration: options.schema.autoMigration },
    });

    db = pongo.db(options.schema.database);
  }

  shell.context.pongo = pongo;
  shell.context.db = db;

  // helpers
  shell.context.SQL = SQL;
  shell.context.setLogLevel = setLogLevel;
  shell.context.setLogStyle = setLogStyle;
  shell.context.prettifyLogs = prettifyLogs;
  shell.context.printResultsAsTable = printResultsAsTable;
  shell.context.LogStyle = LogStyle;
  shell.context.LogLevel = LogLevel;

  // Intercept REPL output to display results as a table if they are arrays
  shell.on('exit', async () => {
    await teardown();
    process.exit();
  });

  shell.on('SIGINT', async () => {
    await teardown();
    process.exit();
  });
};

const teardown = async () => {
  console.log(color.yellow('Exiting Pongo Shell...'));
  await pongo.close();
};

process.on('uncaughtException', teardown);
process.on('SIGINT', teardown);

interface ShellOptions {
  database: string;
  collection: string[];
  connectionString?: string;
  disableAutoMigrations: boolean;
  logStyle?: string;
  logLevel?: string;
  prettyLog?: boolean;
  printOptions?: boolean;
}

const shellCommand = new Command('shell')
  .description('Start an interactive Pongo shell')
  .option(
    '-cs, --connectionString <string>',
    'Connection string for the database',
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
  .option(
    '-no-migrations, --disable-auto-migrations',
    'Disable automatic migrations',
  )
  .option('-o, --print-options', 'Print shell options')
  .option(
    '-ll, --log-level <logLevel>',
    'Log level: DISABLED, INFO, LOG, WARN, ERROR',
    'DISABLED',
  )
  .option('-ls, --log-style', 'Log style: RAW, PRETTY', 'RAW')
  .option('-p, --pretty-log', 'Turn on logging with prettified output')
  .action(async (options: ShellOptions) => {
    const { collection, database } = options;
    const connectionString = options.connectionString;

    await startRepl({
      logging: {
        printOptions: options.printOptions === true,
        logStyle: options.prettyLog
          ? LogStyle.PRETTY
          : ((options.logStyle as LogStyle | undefined) ?? LogStyle.RAW),
        logLevel: options.logLevel
          ? (options.logLevel as LogLevel)
          : options.prettyLog
            ? LogLevel.INFO
            : LogLevel.DISABLED,
      },
      schema: {
        collections: collection,
        database,
        autoMigration: options.disableAutoMigrations
          ? 'None'
          : 'CreateOrUpdate',
      },
      connectionString,
    });
  });

export { shellCommand };
