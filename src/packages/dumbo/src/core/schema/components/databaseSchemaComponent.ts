import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
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

  const sc = schemaComponent(DatabaseURN({ name: databaseName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...schemas],
  });

  return {
    ...sc,
    databaseName,
    get schemas() {
      return mapSchemaComponentsOfType<DatabaseSchemaSchemaComponent>(
        sc.components,
        DatabaseURNType,
        (c) => c.schemaName,
      );
    },
  };
};
