import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  TableURNType,
  tableSchemaComponent,
  type TableSchemaComponent,
} from './tableSchemaComponent';

export type DatabaseSchemaURNType = 'sc:dumbo:schema';
export type DatabaseSchemaURN = `${DatabaseSchemaURNType}:${string}`;

export const DatabaseSchemaURNType: DatabaseSchemaURNType = 'sc:dumbo:schema';
export const DatabaseSchemaURN = ({
  name,
}: {
  name: string;
}): DatabaseSchemaURN => `${DatabaseSchemaURNType}:${name}`;

export type DatabaseSchemaSchemaComponent = SchemaComponent<
  DatabaseSchemaURN,
  Readonly<{
    schemaName: string;
    tables: ReadonlyMap<string, TableSchemaComponent>;
  }>
>;

export const databaseSchemaSchemaComponent = ({
  schemaName,
  tableNames,
  ...migrationsOrComponents
}: {
  schemaName: string;
  tableNames?: string[];
} & SchemaComponentOptions): DatabaseSchemaSchemaComponent => {
  const tables =
    tableNames?.map((tableName) => tableSchemaComponent({ tableName })) ?? [];

  const sc = schemaComponent(DatabaseSchemaURN({ name: schemaName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...tables],
  });

  return {
    ...sc,
    schemaName,
    get tables() {
      return mapSchemaComponentsOfType<TableSchemaComponent>(
        sc.components,
        TableURNType,
        (c) => c.tableName,
      );
    },
  };
};
