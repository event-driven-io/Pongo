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
        `type ${formatTypeName(name)} = { name: string; description: string; date: Date }`,
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
${collections}
    }),
  }),
};`;
};

const missingDefaultExport = `Error: Config should contain default export, e.g.\n\n${sampleConfig()}`;
const missingSchema = `Error: Config should contain schema property, e.g.\n\n${sampleConfig()}`;
const missingDbs = `Error: Config should have at least a single database defined, e.g.\n\n${sampleConfig()}`;
const missingDefaultDb = `Error: Config should have a default database defined (without name or or with default database name), e.g.\n\n${sampleConfig()}`;
const missingCollections = `Error: Database should have defined at least one collection, e.g.\n\n${sampleConfig()}`;

export const loadConfigFile = async (
  configPath: string,
): Promise<PongoDbSchemaMetadata> => {
  const configUrl = new URL(configPath, `file://${process.cwd()}/`);
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const imported: Partial<{ default: PongoSchemaConfig }> = await import(
      configUrl.href
    );

    const parsed = parseDefaultDbSchema(imported);

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

export const parseDefaultDbSchema = (
  imported: Partial<{ default: PongoSchemaConfig }>,
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

  const dbs = objectEntries(imported.default.schema.dbs).map((db) => db[1]);

  const defaultDb = dbs.find((db) => db.name === undefined);

  if (!defaultDb) {
    return missingDefaultDb;
  }

  if (!defaultDb.collections) {
    return missingCollections;
  }

  const collections = objectEntries(defaultDb.collections).map((col) => col[1]);

  if (collections.length === 0) {
    return missingCollections;
  }

  return toDbSchemaMetadata(defaultDb);
};

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

const sampleConfigCommand = configCommand
  .command('sample')
  .description('Generate or print sample configuration')
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

sampleConfigCommand.command('generate');
