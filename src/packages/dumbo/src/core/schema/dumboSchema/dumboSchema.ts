import type { AnyColumnTypeToken, DefaultDatabaseSchemaName } from '../../sql';
import {
  columnSchemaComponent,
  type ColumnSchemaComponent,
  type ColumnSchemaComponentOptions,
  databaseComponent,
  type DatabaseComponent,
  type DatabaseComponentOptions,
  type DatabaseExtensions,
  databaseSchemaComponent,
  type DatabaseSchemaComponent,
  type DatabaseSchemas,
  type DatabaseSchemaTables,
  type DatabaseTables,
  type DefaultSchemaKey,
  extensionComponent,
  indexComponent,
  type IndexComponent,
  type SchemaExtensions,
  type TableColumns,
  tableComponent,
  type TableComponent,
  type TableIndexes,
  type TableRelationships,
  type ValidateDatabaseSchemas,
} from '../components';
import type { SQLMigration } from '../sqlMigration';

function dumboColumn<
  const ColumnType extends AnyColumnTypeToken | string,
  const ColumnName extends string,
  const Kind extends string | undefined = undefined,
>(
  name: ColumnName,
  type: ColumnType,
  options: Omit<ColumnSchemaComponentOptions<ColumnType, Kind>, 'type'> &
    ({ notNull: true } | { primaryKey: true }),
): ColumnSchemaComponent<ColumnType, ColumnName, Kind> & { notNull: true };
function dumboColumn<
  const ColumnType extends AnyColumnTypeToken | string,
  const ColumnName extends string,
  const Kind extends string | undefined = undefined,
>(
  name: ColumnName,
  type: ColumnType,
  options?: Omit<ColumnSchemaComponentOptions<ColumnType, Kind>, 'type'>,
): ColumnSchemaComponent<ColumnType, ColumnName, Kind> & { notNull?: false };
function dumboColumn(
  name: string,
  type: AnyColumnTypeToken | string,
  options?: Omit<
    ColumnSchemaComponentOptions<
      AnyColumnTypeToken | string,
      string | undefined
    >,
    'type'
  >,
): ColumnSchemaComponent<
  AnyColumnTypeToken | string,
  string,
  string | undefined
> {
  return columnSchemaComponent({
    ...options,
    columnName: name,
    type,
  });
}

const dumboIndex = <
  const Name extends string,
  const ColumnNames extends readonly string[],
  const Kind extends string | undefined = undefined,
>(
  name: Name,
  columnNames: ColumnNames,
  options?: Omit<
    Parameters<typeof indexComponent<Name, ColumnNames, Kind>>[0],
    'indexName' | 'columnNames' | 'isUnique'
  > & { unique?: boolean },
): IndexComponent<Name, ColumnNames, Kind> =>
  indexComponent({
    indexName: name,
    columnNames,
    isUnique: options?.unique ?? false,
    ...options,
  });

const dumboTable = <
  const Columns extends TableColumns = TableColumns,
  const TableName extends string = string,
  const Indexes extends TableIndexes = TableIndexes,
  const Relationships extends TableRelationships<keyof Columns & string> =
    TableRelationships<keyof Columns & string>,
  const Kind extends string | undefined = undefined,
>(
  name: TableName,
  definition: Readonly<{
    kind?: Kind;
    columns?: Columns;
    primaryKey?: ReadonlyArray<Extract<keyof Columns, string>>;
    relationships?: Relationships;
    indexes?: Indexes;
    migrations?: () => ReadonlyArray<SQLMigration>;
  }> = {},
): TableComponent<Columns, TableName, Indexes, Relationships, Kind> =>
  tableComponent({
    tableName: name,
    ...definition,
  });

type EmptyComponentMap = Readonly<Record<never, never>>;

const dumboDatabaseSchema = <
  const Tables extends DatabaseSchemaTables,
  const Name extends string,
  const Extensions extends SchemaExtensions = EmptyComponentMap,
>(
  name: Name,
  tables: Tables,
  extensions?: Extensions,
): DatabaseSchemaComponent<Tables, Name, Extensions> =>
  databaseSchemaComponent<Tables, Name, Extensions>({
    schemaName: name,
    tables,
    extensions,
  });

type DeclaredSchemas<
  Tables extends DatabaseTables,
  Schemas extends DatabaseSchemas,
> = Readonly<
  Record<
    DefaultSchemaKey,
    DatabaseSchemaComponent<Tables, DefaultDatabaseSchemaName>
  >
> &
  Schemas;

type WithoutDatabaseName<Options> = Options extends unknown
  ? Omit<Options, 'databaseName'>
  : never;

type ValidatedDatabaseComponent<
  DatabaseName extends string | undefined,
  Tables extends DatabaseTables,
  Schemas extends DatabaseSchemas,
  Extensions extends DatabaseExtensions,
  Kind extends string | undefined,
> =
  ValidateDatabaseSchemas<DeclaredSchemas<Tables, Schemas>> extends {
    valid: false;
    error: infer ErrorType;
  }
    ? { valid: false; error: ErrorType }
    : DatabaseComponent<DatabaseName, Tables, Schemas, Extensions, Kind>;

function dumboDatabase<
  const Tables extends DatabaseTables = EmptyComponentMap,
  const Schemas extends DatabaseSchemas = EmptyComponentMap,
  const Extensions extends DatabaseExtensions = EmptyComponentMap,
  const Kind extends string | undefined = undefined,
>(
  options: WithoutDatabaseName<
    DatabaseComponentOptions<undefined, Tables, Schemas, Extensions, Kind>
  >,
): ValidatedDatabaseComponent<undefined, Tables, Schemas, Extensions, Kind>;
function dumboDatabase<
  const Name extends string,
  const Tables extends DatabaseTables = EmptyComponentMap,
  const Schemas extends DatabaseSchemas = EmptyComponentMap,
  const Extensions extends DatabaseExtensions = EmptyComponentMap,
  const Kind extends string | undefined = undefined,
>(
  databaseName: Name,
  options: WithoutDatabaseName<
    DatabaseComponentOptions<Name, Tables, Schemas, Extensions, Kind>
  >,
): ValidatedDatabaseComponent<Name, Tables, Schemas, Extensions, Kind>;
function dumboDatabase(
  databaseNameOrOptions:
    | string
    | WithoutDatabaseName<
        DatabaseComponentOptions<
          string | undefined,
          DatabaseTables,
          DatabaseSchemas,
          DatabaseExtensions,
          string | undefined
        >
      >,
  maybeOptions?: WithoutDatabaseName<
    DatabaseComponentOptions<
      string | undefined,
      DatabaseTables,
      DatabaseSchemas,
      DatabaseExtensions,
      string | undefined
    >
  >,
): unknown {
  const databaseName =
    typeof databaseNameOrOptions === 'string'
      ? databaseNameOrOptions
      : undefined;
  const { tables, schemas, ...shared } =
    (typeof databaseNameOrOptions === 'string'
      ? maybeOptions
      : databaseNameOrOptions) ?? {};

  return schemas !== undefined
    ? databaseComponent({ databaseName, ...shared, schemas })
    : databaseComponent({ databaseName, ...shared, tables });
}

dumboDatabase.from = (
  databaseName: string | undefined,
  schemaNames: string[],
): DatabaseComponent => {
  const schemas = Object.fromEntries(
    schemaNames.map((schemaName) => [
      schemaName,
      dumboDatabaseSchema(schemaName, {}),
    ]),
  );
  return databaseName === undefined
    ? dumboDatabase({ schemas })
    : dumboDatabase(databaseName, { schemas });
};

export const dumboSchema = {
  database: dumboDatabase,
  schema: dumboDatabaseSchema,
  table: dumboTable,
  column: dumboColumn,
  index: dumboIndex,
  extension: extensionComponent,
};
