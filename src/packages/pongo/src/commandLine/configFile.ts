import { Command } from 'commander';
import fs from 'node:fs';
import {
  objectEntries,
  toDbSchemaMetadata,
  type PongoDbSchemaMetadata,
  type PongoSchemaConfig,
} from '../core';

const formatTypeName = (input: string): string => {
  if (input.length === 0) {
    return input;
  }

  let formatted = input.charAt(0).toUpperCase() + input.slice(1);

  if (formatted.endsWith('s')) {
    formatted = formatted.slice(0, -1);
  }

  return formatted;
};

const sampleConfig = (collectionNames: string[] = ['users']) => {
  const types = collectionNames
    .map(
      (name) =>
        `export type ${formatTypeName(name)} = { name: string; description: string; date: Date }`,
    )
    .join('\n');

  const collections = collectionNames
    .map(
      (name) =>
        `      ${name}: pongoSchema.collection<${formatTypeName(name)}>('${name}'),`,
    )
    .join('\n');

  return `import { pongoSchema } from '@event-driven-io/pongo';

${types}

export default {
  schema: pongoSchema.client({
    database: pongoSchema.db({
      collections: {
${collections}
      },
    }),
  }),
};`;
};

const missingDefaultExport = `Error: Config should contain default export, e.g.\n\n${sampleConfig()}`;
const missingSchema = `Error: Config should contain schema property, e.g.\n\n${sampleConfig()}`;
const missingDbs = `Error: Config should have at least a single database defined, e.g.\n\n${sampleConfig()}`;
const missingCollections = `Error: Database should have defined at least one collection, e.g.\n\n${sampleConfig()}`;

const formatDatabaseNames = (
  databases: ReadonlyArray<PongoDbSchemaMetadata>,
): string =>
  databases
    .map((database) => database.name ?? '<unnamed>')
    .sort()
    .join(', ');

export const loadConfigFile = async (
  configPath: string,
  databaseName?: string,
): Promise<PongoDbSchemaMetadata> => {
  const configUrl = new URL(configPath, `file://${process.cwd()}/`);
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const imported: Partial<{ default: PongoSchemaConfig }> = await import(
      configUrl.href
    );

    const parsed = parseDbSchemaFromConfig(imported, databaseName);

    if (typeof parsed === 'string') {
      console.error(parsed);
      process.exit(1);
    }

    return parsed;
  } catch {
    console.error(`Error: Couldn't load file: ${configUrl.href}`);
    process.exit(1);
  }
};

export const generateConfigFile = (
  configPath: string,
  collectionNames: string[],
): void => {
  try {
    fs.writeFileSync(configPath, sampleConfig(collectionNames), 'utf8');
    console.log(`Configuration file stored at: ${configPath}`);
  } catch (error) {
    console.error(`Error: Couldn't store config file: ${configPath}!`);
    console.error(error);
    process.exit(1);
  }
};

export const parseDbSchemaFromConfig = (
  imported: Partial<{ default: PongoSchemaConfig }>,
  databaseName?: string,
): PongoDbSchemaMetadata | string => {
  if (!imported.default) {
    return missingDefaultExport;
  }

  if (!imported.default.schema) {
    return missingSchema;
  }

  if (!imported.default.schema.dbs) {
    return missingDbs;
  }

  const dbs = objectEntries(imported.default.schema.dbs)
    .map((db) => db[1])
    .map(toDbSchemaMetadata);

  if (dbs.length === 0) {
    return missingDbs;
  }

  const selected =
    databaseName !== undefined
      ? dbs.find((db) => db.name === databaseName)
      : dbs.length === 1
        ? dbs[0]
        : undefined;

  if (!selected) {
    const names = formatDatabaseNames(dbs);
    return databaseName !== undefined
      ? `Error: Config does not define database "${databaseName}". Found: ${names}`
      : `Error: Config defines multiple databases. Select one with --database-name. Found: ${names}`;
  }

  if (selected.collections.length === 0) {
    return missingCollections;
  }

  return selected;
};

export const parseDefaultDbSchema = parseDbSchemaFromConfig;

type SampleConfigOptions =
  | {
      collection: string[];
      print?: boolean;
    }
  | {
      collection: string[];
      generate?: boolean;
      file?: string;
    };

export const configCommand = new Command('config').description(
  'Manage Pongo configuration',
);

configCommand
  .command('sample')
  .description('Generate or print sample configuration')
  .option(
    '--col, --collection <name>',
    'Specify the collection name',
    (value: string, previous: string[]) => {
      // Accumulate collection names into an array (explicitly typing `previous` as `string[]`)
      return previous.concat([value]);
    },
    [] as string[],
  )
  .option(
    '-f, --file <path>',
    'Path to configuration file with collection list',
  )
  .option('-g, --generate', 'Generate sample config file')
  .option('-p, --print', 'Print sample config file')
  .action((options: SampleConfigOptions) => {
    const collectionNames =
      options.collection.length > 0 ? options.collection : ['users'];

    if (!('print' in options) && !('generate' in options)) {
      console.error(
        'Error: Please provide either:\n--print param to print sample config or\n--generate to generate sample config file',
      );
      process.exit(1);
    }

    if ('print' in options) {
      console.log(`${sampleConfig(collectionNames)}`);
    } else if ('generate' in options) {
      if (!options.file) {
        console.error(
          'Error: You need to provide a config file through a --file',
        );
        process.exit(1);
      }

      generateConfigFile(options.file, collectionNames);
    }
  });
