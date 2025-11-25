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
export type DatabaseSchemaURN<SchemaName extends string = string> =
  `${DatabaseSchemaURNType}:${SchemaName}`;

export const DatabaseSchemaURNType: DatabaseSchemaURNType =
  'sc:dumbo:database_schema';
export const DatabaseSchemaURN = <SchemaName extends string = string>({
  name,
}: {
  name: SchemaName;
}): DatabaseSchemaURN<SchemaName> => `${DatabaseSchemaURNType}:${name}`;

export type DatabaseSchemaTables<
  Tables extends AnyTableSchemaComponent = AnyTableSchemaComponent,
> = Record<string, Tables>;

export type DatabaseSchemaSchemaComponent<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  SchemaName extends string = string,
> = SchemaComponent<
  DatabaseSchemaURN<SchemaName>,
  Readonly<{
    schemaName: SchemaName;
    tables: ReadonlyMap<string, TableSchemaComponent> & Tables;
    addTable: (table: string | TableSchemaComponent) => TableSchemaComponent;
  }>
>;

export type AnyDatabaseSchemaSchemaComponent =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DatabaseSchemaSchemaComponent<any, any>;

export const databaseSchemaSchemaComponent = <
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string = string,
>({
  schemaName,
  tables,
  ...migrationsOrComponents
}: {
  schemaName: SchemaName;
  tables?: Tables;
} & SchemaComponentOptions): DatabaseSchemaSchemaComponent<
  Tables,
  SchemaName
> => {
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
