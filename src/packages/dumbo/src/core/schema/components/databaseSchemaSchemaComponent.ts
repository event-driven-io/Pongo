import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  TableURNType,
  tableSchemaComponent,
  type AnyTableSchemaComponent,
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

export type DatabaseSchemaTables<
  Tables extends AnyTableSchemaComponent = AnyTableSchemaComponent,
> = Record<string, Tables>;

export type DatabaseSchemaSchemaComponent<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
> = SchemaComponent<
  DatabaseSchemaURN,
  Readonly<{
    schemaName: string;
    tables: ReadonlyMap<string, TableSchemaComponent> & Tables;
    addTable: (table: string | TableSchemaComponent) => TableSchemaComponent;
  }>
>;

export type AnyDatabaseSchemaSchemaComponent =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseSchemaSchemaComponent<any>;

export const databaseSchemaSchemaComponent = <
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
>({
  schemaName,
  tables,
  ...migrationsOrComponents
}: {
  schemaName: string;
  tables?: Tables;
} & SchemaComponentOptions): DatabaseSchemaSchemaComponent<Tables> => {
  const base = schemaComponent(DatabaseSchemaURN({ name: schemaName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [
      ...(migrationsOrComponents.components ?? []),
      ...Object.values(tables ?? {}),
    ],
  });

  return {
    ...base,
    schemaName,
    get tables() {
      const tablesMap = mapSchemaComponentsOfType<TableSchemaComponent>(
        base.components,
        TableURNType,
        (c) => c.tableName,
      );

      return Object.assign(tablesMap, tables);
    },
    addTable: (table: string | TableSchemaComponent) =>
      base.addComponent(
        typeof table === 'string'
          ? tableSchemaComponent({ tableName: table })
          : table,
      ),
  };
};
