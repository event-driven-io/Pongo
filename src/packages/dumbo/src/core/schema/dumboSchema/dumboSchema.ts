import type { AnyColumnTypeToken, SQLColumnToken } from '../../sql';
import type { ValidateDatabaseSchemasWithMessages } from '../components';
import {
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
  type TableRelationships,
  tableSchemaComponent,
  type TableSchemaComponent,
} from '../components';
import { type SchemaComponentOptions } from '../schemaComponent';

const DEFAULT_DATABASE_NAME = '__default_database__';
const DEFAULT_DATABASE_SCHEMA_NAME = '__default_database_schema__';

const dumboColumn = <
  const ColumnType extends AnyColumnTypeToken | string =
    | AnyColumnTypeToken
    | string,
  const TOptions extends SchemaComponentOptions &
    Omit<SQLColumnToken<ColumnType>, 'name' | 'type' | 'sqlTokenType'> = Omit<
    ColumnSchemaComponentOptions<ColumnType>,
    'type'
  >,
  const ColumnName extends string = string,
>(
  name: ColumnName,
  type: ColumnType,
  options?: TOptions,
) =>
  columnSchemaComponent<
    ColumnType,
    TOptions & { type: ColumnType },
    ColumnName
  >({
    columnName: name,
    type,
    ...options,
  } as { columnName: ColumnName } & TOptions & { type: ColumnType });

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
  const Columns extends TableColumns = TableColumns,
  const TableName extends string = string,
  const Relationships extends TableRelationships<
    keyof Columns & string
  > = TableRelationships<keyof Columns & string>,
>(
  name: TableName,
  definition: {
    columns?: Columns;
    primaryKey?: TableColumnNames<
      TableSchemaComponent<Columns, TableName, Relationships>
    >[];
    relationships?: Relationships;
    indexes?: Record<string, IndexSchemaComponent>;
  } & SchemaComponentOptions,
): TableSchemaComponent<Columns, TableName, Relationships> => {
  const { columns, indexes, primaryKey, relationships, ...options } =
    definition;

  const components = [...(indexes ? Object.values(indexes) : [])];

  return tableSchemaComponent({
    tableName: name,
    columns: columns ?? ({} as Columns),
    primaryKey: primaryKey ?? [],
    ...(relationships !== undefined ? { relationships } : {}),
    components,
    ...options,
  });
};

function dumboDatabaseSchema<
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
>(
  tables: Tables,
): DatabaseSchemaSchemaComponent<Tables, typeof DEFAULT_DATABASE_SCHEMA_NAME>;
function dumboDatabaseSchema<
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string = string,
>(
  schemaName: SchemaName,
  tables: Tables,
  options?: SchemaComponentOptions,
): DatabaseSchemaSchemaComponent<Tables, SchemaName>;
function dumboDatabaseSchema<
  const Tables extends DatabaseSchemaTables = DatabaseSchemaTables,
  const SchemaName extends string = string,
>(
  nameOrTables: SchemaName | Tables,
  tables?: Tables,
  options?: SchemaComponentOptions,
): DatabaseSchemaSchemaComponent<Tables, SchemaName> {
  const schemaName =
    typeof nameOrTables === 'string'
      ? nameOrTables
      : (DEFAULT_DATABASE_SCHEMA_NAME as SchemaName);
  const tablesMap =
    (typeof nameOrTables === 'string' ? tables : nameOrTables) ??
    ({} as Tables);
  return databaseSchemaSchemaComponent({
    schemaName,
    tables: tablesMap,
    ...options,
  });
}

type ValidatedDatabaseSchemaComponent<
  Schemas extends DatabaseSchemas = DatabaseSchemas,
> =
  ValidateDatabaseSchemasWithMessages<Schemas> extends { valid: true }
    ? DatabaseSchemaComponent<Schemas>
    : ValidateDatabaseSchemasWithMessages<Schemas> extends {
          valid: false;
          error: infer E;
        }
      ? { valid: false; error: E }
      : DatabaseSchemaComponent<Schemas>;

function dumboDatabase<Schemas extends DatabaseSchemas = DatabaseSchemas>(
  databaseName: string,
  schemas: ValidateDatabaseSchemasWithMessages<Schemas>,
  options?: SchemaComponentOptions,
): ValidatedDatabaseSchemaComponent<Schemas> {
  return databaseSchemaComponent({
    databaseName,
    schemas: schemas as Schemas,
    ...(options ?? {}),
  }) as ValidatedDatabaseSchemaComponent<Schemas>;
}

dumboDatabase.defaultName = DEFAULT_DATABASE_NAME;
dumboDatabaseSchema.defaultName = DEFAULT_DATABASE_SCHEMA_NAME;

export const dumboSchema = {
  database: dumboDatabase,
  schema: dumboDatabaseSchema,
  table: dumboTable,
  column: dumboColumn,
  index: dumboIndex,
};
