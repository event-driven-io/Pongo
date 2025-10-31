import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  DatabaseSchemaURNType,
  databaseSchemaSchemaComponent,
  type DatabaseSchemaSchemaComponent,
} from './databaseSchemaSchemaComponent';

export type DatabaseURNType = 'sc:dumbo:database';
export type DatabaseURN = `${DatabaseURNType}:${string}`;

export const DatabaseURNType: DatabaseURNType = 'sc:dumbo:database';
export const DatabaseURN = ({ name }: { name: string }): DatabaseURN =>
  `${DatabaseURNType}:${name}`;

export type DatabaseSchemaComponent = SchemaComponent<
  DatabaseURN,
  Readonly<{
    databaseName: string;
    schemas: ReadonlyMap<string, DatabaseSchemaSchemaComponent>;
    addSchema: (
      schema: string | DatabaseSchemaSchemaComponent,
    ) => DatabaseSchemaSchemaComponent;
  }>
>;

export const databaseSchemaComponent = ({
  databaseName,
  schemaNames,
  ...migrationsOrComponents
}: {
  databaseName: string;
  schemaNames?: string[];
} & SchemaComponentOptions): DatabaseSchemaComponent => {
  const schemas =
    schemaNames?.map((schemaName) =>
      databaseSchemaSchemaComponent({ schemaName }),
    ) ?? [];

  const base = schemaComponent(DatabaseURN({ name: databaseName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...schemas],
  });

  return {
    ...base,
    databaseName,
    get schemas() {
      return mapSchemaComponentsOfType<DatabaseSchemaSchemaComponent>(
        base.components,
        DatabaseSchemaURNType,
        (c) => c.schemaName,
      );
    },
    addSchema: (schema: string | DatabaseSchemaSchemaComponent) =>
      base.addComponent(
        typeof schema === 'string'
          ? databaseSchemaSchemaComponent({ schemaName: schema })
          : schema,
      ),
  };
};
