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

export type DatabaseSchemaURNType = 'sc:dumbo:database_schema';
export type DatabaseSchemaURN = `${DatabaseSchemaURNType}:${string}`;

export const DatabaseSchemaURNType: DatabaseSchemaURNType =
  'sc:dumbo:database_schema';
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
    addTable: (table: string | TableSchemaComponent) => TableSchemaComponent;
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

  const base = schemaComponent(DatabaseSchemaURN({ name: schemaName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? []), ...tables],
  });

  return {
    ...base,
    schemaName,
    get tables() {
      return mapSchemaComponentsOfType<TableSchemaComponent>(
        base.components,
        TableURNType,
        (c) => c.tableName,
      );
    },
    addTable: (table: string | TableSchemaComponent) =>
      base.addComponent(
        typeof table === 'string'
          ? tableSchemaComponent({ tableName: table })
          : table,
      ),
  };
};
