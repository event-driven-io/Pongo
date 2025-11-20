import type { AnyColumnTypeToken, SQLColumnToken } from '../../sql';
import type { ValidateDatabaseForeignKeys } from '../components';
import {
  type AnyDatabaseSchemaSchemaComponent,
  columnSchemaComponent,
  type ColumnSchemaComponentOptions,
  databaseSchemaComponent,
  type DatabaseSchemaComponent,
  type DatabaseSchemas,
  databaseSchemaSchemaComponent,
  type DatabaseSchemaSchemaComponent,
  type DatabaseSchemaTables,
  indexSchemaComponent,
  type IndexSchemaComponent,
  type TableColumnNames,
  type TableColumns,
  type TableForeignKeys,
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

const dumboColumn = <
  ColumnType extends AnyColumnTypeToken | string = AnyColumnTypeToken | string,
  TOptions extends SchemaComponentOptions &
    Omit<SQLColumnToken<ColumnType>, 'name' | 'type' | 'sqlTokenType'> = Omit<
    ColumnSchemaComponentOptions<ColumnType>,
    'type'
  >,
>(
  name: string,
  type: ColumnType,
  options?: TOptions,
): ReturnType<
  typeof columnSchemaComponent<ColumnType, TOptions & { type: ColumnType }>
> =>
  columnSchemaComponent<ColumnType, TOptions & { type: ColumnType }>({
    columnName: name,
    type,
    ...options,
  } as { columnName: string } & TOptions & { type: ColumnType });

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

const dumboTable = <
  Columns extends TableColumns = TableColumns,
  const ForeignKeys extends TableForeignKeys<
    keyof Columns & string
  > = TableForeignKeys<keyof Columns & string>,
>(
  name: string,
  definition: {
    columns?: Columns;
    primaryKey?: TableColumnNames<TableSchemaComponent<Columns, ForeignKeys>>[];
    foreignKeys?: ForeignKeys;
    indexes?: Record<string, IndexSchemaComponent>;
  } & SchemaComponentOptions,
): TableSchemaComponent<Columns, ForeignKeys> => {
  const { columns, indexes, primaryKey, foreignKeys, ...options } = definition;

  const components = [...(indexes ? Object.values(indexes) : [])];

  return tableSchemaComponent({
    tableName: name,
    columns: columns ?? ({} as Columns),
    primaryKey: primaryKey ?? [],
    ...(foreignKeys !== undefined ? { foreignKeys } : {}),
    components,
    ...options,
  });
};

function dumboDatabaseSchema<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
>(tables: Tables): DatabaseSchemaSchemaComponent<Tables>;
function dumboDatabaseSchema<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
>(
  schemaName: string,
  tables: Tables,
  options?: SchemaComponentOptions,
): DatabaseSchemaSchemaComponent<Tables>;
function dumboDatabaseSchema<
  Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
>(
  nameOrTables: string | Tables,
  tables?: Tables,
  options?: SchemaComponentOptions,
): DatabaseSchemaSchemaComponent<Tables> {
  const schemaName =
    typeof nameOrTables === 'string'
      ? nameOrTables
      : DEFAULT_DATABASE_SCHEMA_NAME;
  const tablesMap =
    (typeof nameOrTables === 'string' ? tables : nameOrTables) ??
    ({} as Tables);
  return databaseSchemaSchemaComponent({
    schemaName,
    tables: tablesMap,
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

type ValidatedDatabaseSchemaComponent<
  Schemas extends DatabaseSchemas = DatabaseSchemas,
> =
  ValidateDatabaseForeignKeys<DatabaseSchemaComponent<Schemas>> extends {
    valid: true;
  }
    ? DatabaseSchemaComponent<Schemas>
    : ValidateDatabaseForeignKeys<DatabaseSchemaComponent<Schemas>>;

function dumboDatabase<Schemas extends DatabaseSchemas = DatabaseSchemas>(
  schemas: Schemas,
): ValidatedDatabaseSchemaComponent<Schemas>;
function dumboDatabase<Schemas extends DatabaseSchemas = DatabaseSchemas>(
  schema: DatabaseSchemaSchemaComponent,
): ValidatedDatabaseSchemaComponent<Schemas>;
function dumboDatabase<Schemas extends DatabaseSchemas = DatabaseSchemas>(
  databaseName: string,
  schemas: Schemas,
  options?: SchemaComponentOptions,
): ValidatedDatabaseSchemaComponent<Schemas>;
function dumboDatabase<Schemas extends DatabaseSchemas = DatabaseSchemas>(
  databaseName: string,
  schema: AnyDatabaseSchemaSchemaComponent,
  options?: SchemaComponentOptions,
): ValidatedDatabaseSchemaComponent<Schemas>;
function dumboDatabase<Schemas extends DatabaseSchemas = DatabaseSchemas>(
  nameOrSchemas: string | DatabaseSchemaSchemaComponent | Schemas,
  schemasOrOptions?:
    | DatabaseSchemaSchemaComponent
    | Schemas
    | SchemaComponentOptions,
  options?: SchemaComponentOptions,
): ValidatedDatabaseSchemaComponent<Schemas> {
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

  return databaseSchemaComponent({
    databaseName,
    schemas: schemaMap as Schemas,
    ...dbOptions,
  });
}

dumboDatabase.from = <Schemas extends DatabaseSchemas = DatabaseSchemas>(
  databaseName: string | undefined,
  schemaNames: string[],
): ValidatedDatabaseSchemaComponent<Schemas> => {
  const schemas = schemaNames.reduce(
    (acc, schemaName) => {
      acc[schemaName] = dumboDatabaseSchema(
        schemaName,
        {} as DatabaseSchemaTables,
      );
      return acc;
    },
    {} as Record<string, DatabaseSchemaSchemaComponent>,
  ) as Schemas;

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
