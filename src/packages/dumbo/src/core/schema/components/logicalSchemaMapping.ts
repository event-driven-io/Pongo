import { findExpandedSchemaComponentsOfType } from '../expandSchemaComponent';
import type { AnySchemaComponent } from '../schemaComponent';
import type { AnyDatabaseSchemaComponent } from './databaseSchemaComponent';
import { DatabaseSchemaURNType } from './databaseSchemaSchemaComponent';
import { TableURNType } from './tableSchemaComponent';

type LogicalSchemaTable = {
  tableName: string;
};

type LogicalSchema = {
  schemaName: string;
  tables: ReadonlyMap<string, LogicalSchemaTable>;
};

type DatabaseSchemaComponentView = AnySchemaComponent & {
  schemaName: string;
};

type TableComponentView = AnySchemaComponent & {
  tableName: string;
};

export type LogicalSchemaMapping =
  { mode: 'strict' } | { mode: 'prefix'; separator?: string };

export type LogicalSchemaCollision = {
  physicalName: string;
  first: {
    schemaName: string;
    tableName: string;
  };
  second: {
    schemaName: string;
    tableName: string;
  };
};

export const collectLogicalSchemaCollisions = (
  schemas: Iterable<LogicalSchema>,
): LogicalSchemaCollision[] => {
  const physicalTables = new Map<
    string,
    { schemaName: string; tableName: string }
  >();
  const collisions: LogicalSchemaCollision[] = [];

  for (const schema of schemas) {
    for (const table of schema.tables.values()) {
      const physicalName = table.tableName;
      const previous = physicalTables.get(physicalName);

      if (previous && previous.schemaName !== schema.schemaName) {
        collisions.push({
          physicalName,
          first: previous,
          second: {
            schemaName: schema.schemaName,
            tableName: table.tableName,
          },
        });
        continue;
      }

      physicalTables.set(physicalName, {
        schemaName: schema.schemaName,
        tableName: table.tableName,
      });
    }
  }

  return collisions;
};

export const assertLogicalSchemaMapping = (
  database: AnyDatabaseSchemaComponent,
  mapping: LogicalSchemaMapping = { mode: 'strict' },
): void => {
  assertLogicalSchemaComponentMapping(database, mapping);
};

export const assertLogicalSchemaComponentMapping = (
  component: AnySchemaComponent,
  mapping: LogicalSchemaMapping = { mode: 'strict' },
): void => {
  assertLogicalSchemas(
    findExpandedSchemaComponentsOfType<AnySchemaComponent>(
      component,
      DatabaseSchemaURNType,
    ).map((schemaComponent) => {
      const schema = schemaComponent as unknown as DatabaseSchemaComponentView;

      return {
        schemaName: schema.schemaName,
        tables: findExpandedSchemaComponentsOfType<AnySchemaComponent>(
          schema,
          TableURNType,
        ).reduce((tables, tableComponent) => {
          const table = tableComponent as unknown as TableComponentView;
          const tableName = table.tableName;

          tables.set(tableName, { tableName });
          return tables;
        }, new Map<string, LogicalSchemaTable>()),
      };
    }),
    mapping,
  );
};

const assertLogicalSchemas = (
  schemas: Iterable<LogicalSchema>,
  mapping: LogicalSchemaMapping,
): void => {
  if (mapping.mode !== 'strict') {
    throw new Error(`Unsupported logical schema mapping mode: ${mapping.mode}`);
  }

  const collisions = collectLogicalSchemaCollisions(schemas);

  if (collisions.length === 0) return;

  const details = collisions
    .map(
      (collision) =>
        `${collision.physicalName} (${collision.first.schemaName}.${collision.first.tableName}, ${collision.second.schemaName}.${collision.second.tableName})`,
    )
    .join(', ');

  throw new Error(`Logical schema collision detected: ${details}`);
};
