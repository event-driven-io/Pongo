import type { AnyColumnTypeToken, SQLDefaultSchemaNameToken } from '../../sql';
import type { DefaultSchemaKey, ValidateDatabaseSchemas } from '../components';
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
  indexComponent,
  type IndexComponent,
  type SchemaExtensions,
  type TableColumns,
  tableComponent,
  type TableComponent,
  type TableIndexes,
  type TableRelationships,
} from '../components';
import { extensionComponent } from '../extensionComponent';
import type { SQLMigration } from '../sqlMigration';

function dumboColumn<
  const ColumnType extends AnyColumnTypeToken | string,
  const ColumnName extends string,
>(
  name: ColumnName,
  type: ColumnType,
  options: Omit<ColumnSchemaComponentOptions<ColumnType>, 'type'> &
    ({ notNull: true } | { primaryKey: true }),
): ColumnSchemaComponent<ColumnType, ColumnName> & { notNull: true };
function dumboColumn<
  const ColumnType extends AnyColumnTypeToken | string,
  const ColumnName extends string,
>(
  name: ColumnName,
  type: ColumnType,
  options?: Omit<ColumnSchemaComponentOptions<ColumnType>, 'type'>,
): ColumnSchemaComponent<ColumnType, ColumnName> & { notNull?: false };
function dumboColumn(
  name: string,
  type: AnyColumnTypeToken | string,
  options?: Omit<ColumnSchemaComponentOptions, 'type'>,
): ColumnSchemaComponent {
  return columnSchemaComponent({
    ...options,
    columnName: name,
    type,
  });
}

const dumboIndex = <
  const Name extends string,
  const ColumnNames extends readonly string[],
>(
  name: Name,
  columnNames: ColumnNames,
  options?: Omit<
    Parameters<typeof indexComponent<Name, ColumnNames>>[0],
    'indexName' | 'columnNames' | 'isUnique'
  > & { unique?: boolean },
): IndexComponent<Name, ColumnNames> =>
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
>(
  name: TableName,
  definition: Readonly<{
    kind?: string;
    columns?: Columns;
    primaryKey?: ReadonlyArray<Extract<keyof Columns, string>>;
    relationships?: Relationships;
    indexes?: Indexes;
    migrations?: () => ReadonlyArray<SQLMigration>;
  }> = {},
): TableComponent<Columns, TableName, Indexes, Relationships> =>
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
    DatabaseSchemaComponent<Tables, SQLDefaultSchemaNameToken>
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
> =
  ValidateDatabaseSchemas<DeclaredSchemas<Tables, Schemas>> extends {
    valid: false;
    error: infer ErrorType;
  }
    ? { valid: false; error: ErrorType }
    : DatabaseComponent<DatabaseName, Tables, Schemas, Extensions>;

function dumboDatabase<
  const Tables extends DatabaseTables = EmptyComponentMap,
  const Schemas extends DatabaseSchemas = EmptyComponentMap,
  const Extensions extends DatabaseExtensions = EmptyComponentMap,
>(
  options: WithoutDatabaseName<
    DatabaseComponentOptions<undefined, Tables, Schemas, Extensions>
  >,
): ValidatedDatabaseComponent<undefined, Tables, Schemas, Extensions>;
function dumboDatabase<
  const Name extends string,
  const Tables extends DatabaseTables = EmptyComponentMap,
  const Schemas extends DatabaseSchemas = EmptyComponentMap,
  const Extensions extends DatabaseExtensions = EmptyComponentMap,
>(
  databaseName: Name,
  options: WithoutDatabaseName<
    DatabaseComponentOptions<Name, Tables, Schemas, Extensions>
  >,
): ValidatedDatabaseComponent<Name, Tables, Schemas, Extensions>;
function dumboDatabase(
  databaseNameOrOptions: string | WithoutDatabaseName<DatabaseComponentOptions>,
  maybeOptions?: WithoutDatabaseName<DatabaseComponentOptions>,
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
