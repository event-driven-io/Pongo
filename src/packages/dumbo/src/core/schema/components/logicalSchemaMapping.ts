import type { AnyDatabaseSchemaComponent } from './databaseSchemaComponent';
import type { AnyDatabaseSchemaSchemaComponent } from './databaseSchemaSchemaComponent';

export type LogicalSchemaMapping =
  | { mode: 'strict' }
  | { mode: 'prefix'; separator?: string }
  | { mode: 'database-per-schema' };

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
  schemas: Iterable<AnyDatabaseSchemaSchemaComponent>,
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
  if (mapping.mode !== 'strict') {
    throw new Error(
      `Unsupported logical schema mapping mode: ${mapping.mode}`,
    );
  }

  const collisions = collectLogicalSchemaCollisions(database.schemas.values());

  if (collisions.length === 0) return;

  const details = collisions
    .map(
      (collision) =>
        `${collision.physicalName} (${collision.first.schemaName}.${collision.first.tableName}, ${collision.second.schemaName}.${collision.second.tableName})`,
    )
    .join(', ');

  throw new Error(`Logical schema collision detected: ${details}`);
};
