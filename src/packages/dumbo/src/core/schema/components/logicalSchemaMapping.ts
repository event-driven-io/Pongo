import { findComponents, type AnySchemaComponent } from '../schemaComponent';
import type { AnyDatabaseComponent } from './databaseComponent';
import { isDatabaseSchemaComponent } from './databaseSchemaComponent';
import { isTableComponent } from './tableComponent';

type SchemaView = AnySchemaComponent & { schemaName: string };
type TableView = AnySchemaComponent & { tableName: string };

export type LogicalSchemaCollision = {
  physicalName: string;
  first: { schemaName: string; tableName: string };
  second: { schemaName: string; tableName: string };
};

export const collectLogicalSchemaCollisions = (
  schemas: Iterable<{
    schemaName: string;
    tables: Iterable<{ tableName: string }>;
  }>,
): LogicalSchemaCollision[] => {
  const physicalTables = new Map<
    string,
    { schemaName: string; tableName: string }
  >();
  const collisions: LogicalSchemaCollision[] = [];

  for (const schema of schemas) {
    for (const table of schema.tables) {
      const previous = physicalTables.get(table.tableName);
      const current = {
        schemaName: schema.schemaName,
        tableName: table.tableName,
      };

      if (previous && previous.schemaName !== schema.schemaName) {
        collisions.push({
          physicalName: table.tableName,
          first: previous,
          second: current,
        });
      } else {
        physicalTables.set(table.tableName, current);
      }
    }
  }

  return collisions;
};

export const assertLogicalSchemaMapping = (
  database: AnyDatabaseComponent,
): void => assertLogicalSchemaComponentMapping(database);

export const assertLogicalSchemaComponentMapping = (
  component: AnySchemaComponent,
): void => {
  const schemas = findComponents(
    component,
    (candidate): candidate is SchemaView =>
      isDatabaseSchemaComponent(candidate) &&
      candidate.schemaName !== undefined,
  ).map((schema) => ({
    schemaName: schema.schemaName,
    tables: findComponents(schema, (candidate): candidate is TableView =>
      isTableComponent(candidate),
    ),
  }));
  const collisions = collectLogicalSchemaCollisions(schemas);

  if (collisions.length === 0) return;

  const details = collisions
    .map(
      ({ physicalName, first, second }) =>
        `${physicalName} (${first.schemaName}.${first.tableName}, ${second.schemaName}.${second.tableName})`,
    )
    .join(', ');

  throw new Error(`Logical schema collision detected: ${details}`);
};
