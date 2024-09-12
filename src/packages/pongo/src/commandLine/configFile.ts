import { objectEntries, type PongoSchemaConfig } from '../core';
import {
  toDbSchemaMetadata,
  type PongoDbSchemaMetadata,
} from '../core/typing/schema';

const sampleConfig = `import { pongoSchema } from '@event-driven-io/pongo';

type User = { name: string };

export default {
  schema: pongoSchema.client({
    database: pongoSchema.db({
      users: pongoSchema.collection<User>('users'),
    }),
  }),
};`;

const missingDefaultExport = `Error: Config should contain default export, e.g.\n\n${sampleConfig}`;
const missingSchema = `Error: Config should contain schema property, e.g.\n\n${sampleConfig}`;
const missingDbs = `Error: Config should have at least a single database defined, e.g.\n\n${sampleConfig}`;
const missingDefaultDb = `Error: Config should have a default database defined (without name or or with default database name), e.g.\n\n${sampleConfig}`;
const missingCollections = `Error: Database should have defined at least one collection, e.g.\n\n${sampleConfig}`;

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
