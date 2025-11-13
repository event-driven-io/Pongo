import type { SQLColumnToken, SQLToken } from '../../sql';
import {
  columnSchemaComponent,
  type ColumnSchemaComponent,
  databaseSchemaComponent,
  type DatabaseSchemaComponent,
  databaseSchemaSchemaComponent,
  type DatabaseSchemaSchemaComponent,
  indexSchemaComponent,
  type IndexSchemaComponent,
  tableSchemaComponent,
  type TableSchemaComponent,
} from '../components';
import {
  type AnySchemaComponent,
  isSchemaComponentOfType,
  type SchemaComponentOptions,
} from '../schemaComponent';

const DEFAULT_DATABASE_NAME = '__default_database__';
const DEFAULT_DATABASE_SCHEMA_NAME = '__default_database_schema__';

const dumboColumn = (
  name: string,
  type: string | SQLToken,
  options: SchemaComponentOptions &
    Omit<SQLColumnToken['value'], 'name' | 'type'> = {},
): ColumnSchemaComponent =>
  columnSchemaComponent({
    columnName: name,
    type,
    ...options,
  });

const dumboIndex = (
  name: string,
  columnNames: string[],
  options?: { unique?: boolean } & SchemaComponentOptions,
): IndexSchemaComponent =>
  indexSchemaComponent({
    indexName: name,
    columnNames,
    isUnique: options?.unique ?? false,
    ...options,
  });

const dumboTable = (
  name: string,
  definition: {
    columns?: Record<string, ColumnSchemaComponent>;
    indexes?: Record<string, IndexSchemaComponent>;
  } & SchemaComponentOptions,
): TableSchemaComponent => {
  const { columns, indexes, ...options } = definition;

  const components = [
    ...(columns ? Object.values(columns) : []),
    ...(indexes ? Object.values(indexes) : []),
  ];

  return tableSchemaComponent({
    tableName: name,
    components,
    ...options,
  });
};

function dumboDatabaseSchema(
  tables: Record<string, TableSchemaComponent>,
): DatabaseSchemaSchemaComponent;
function dumboDatabaseSchema(
  schemaName: string,
  tables: Record<string, TableSchemaComponent>,
  options?: SchemaComponentOptions,
): DatabaseSchemaSchemaComponent;
function dumboDatabaseSchema(
  nameOrTables: string | Record<string, TableSchemaComponent>,
  tables?: Record<string, TableSchemaComponent>,
  options?: SchemaComponentOptions,
): DatabaseSchemaSchemaComponent {
  const schemaName =
    typeof nameOrTables === 'string'
      ? nameOrTables
      : DEFAULT_DATABASE_SCHEMA_NAME;
  const components = Object.values(
    (typeof nameOrTables === 'string' ? tables : nameOrTables) ?? {},
  );

  return databaseSchemaSchemaComponent({
    schemaName,
    components,
    ...options,
  });
}

dumboDatabaseSchema.from = (
  schemaName: string | undefined,
  tableNames: string[],
): DatabaseSchemaSchemaComponent => {
  const tables = tableNames.reduce(
    (acc, tableName) => {
      acc[tableName] = dumboTable(tableName, {});
      return acc;
    },
    {} as Record<string, TableSchemaComponent>,
  );

  return schemaName
    ? dumboDatabaseSchema(schemaName, tables)
    : dumboDatabaseSchema(tables);
};

function dumboDatabase(
  schemas: Record<string, DatabaseSchemaSchemaComponent>,
): DatabaseSchemaComponent;
function dumboDatabase(
  schema: DatabaseSchemaSchemaComponent,
): DatabaseSchemaComponent;
function dumboDatabase(
  databaseName: string,
  schemas: Record<string, DatabaseSchemaSchemaComponent>,
  options?: SchemaComponentOptions,
): DatabaseSchemaComponent;
function dumboDatabase(
  databaseName: string,
  schema: DatabaseSchemaSchemaComponent,
  options?: SchemaComponentOptions,
): DatabaseSchemaComponent;
function dumboDatabase(
  nameOrSchemas:
    | string
    | DatabaseSchemaSchemaComponent
    | Record<string, DatabaseSchemaSchemaComponent>,
  schemasOrOptions?:
    | DatabaseSchemaSchemaComponent
    | Record<string, DatabaseSchemaSchemaComponent>
    | SchemaComponentOptions,
  options?: SchemaComponentOptions,
): DatabaseSchemaComponent {
  const databaseName =
    typeof nameOrSchemas === 'string' ? nameOrSchemas : DEFAULT_DATABASE_NAME;

  const schemasOrSchema =
    typeof nameOrSchemas === 'string'
      ? (schemasOrOptions ?? {})
      : nameOrSchemas;
  const schemaMap: Record<string, DatabaseSchemaSchemaComponent> =
    'schemaComponentKey' in schemasOrSchema &&
    isSchemaComponentOfType<DatabaseSchemaSchemaComponent>(
      schemasOrSchema as AnySchemaComponent,
      'sc:dumbo:database_schema',
    )
      ? {
          [DEFAULT_DATABASE_SCHEMA_NAME]:
            schemasOrSchema as DatabaseSchemaSchemaComponent,
        }
      : (schemasOrSchema as Record<string, DatabaseSchemaSchemaComponent>);

  const dbOptions: typeof options =
    typeof nameOrSchemas === 'string'
      ? options
      : (schemasOrOptions as typeof options);

  const schemaComponents: DatabaseSchemaSchemaComponent[] = [];

  for (const [_, schemaComponent] of Object.entries(schemaMap)) {
    schemaComponents.push(schemaComponent);
  }

  return databaseSchemaComponent({
    databaseName,
    components: schemaComponents,
    ...dbOptions,
  });
}

dumboDatabase.from = (
  databaseName: string | undefined,
  schemaNames: string[],
): DatabaseSchemaComponent => {
  const schemas = schemaNames.reduce(
    (acc, schemaName) => {
      acc[schemaName] = dumboDatabaseSchema(schemaName, {});
      return acc;
    },
    {} as Record<string, DatabaseSchemaSchemaComponent>,
  );

  return databaseName
    ? dumboDatabase(databaseName, schemas)
    : dumboDatabase(schemas);
};

dumboDatabase.defaultName = DEFAULT_DATABASE_NAME;
dumboDatabaseSchema.defaultName = DEFAULT_DATABASE_SCHEMA_NAME;

export const dumboSchema = {
  database: dumboDatabase,
  schema: dumboDatabaseSchema,
  table: dumboTable,
  column: dumboColumn,
  index: dumboIndex,
};
