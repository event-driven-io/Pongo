import { SQLDefaultSchemaNameToken, type AnyColumnTypeToken } from '../../sql';
import type { ValidateDatabaseSchemas } from '../components';
import {
  type AnyDatabaseSchemaComponent,
  columnSchemaComponent,
  type ColumnSchemaComponent,
  type ColumnSchemaComponentOptions,
  databaseComponent,
  type DatabaseComponent,
  type DatabaseExtensions,
  type DatabaseSchemas,
  databaseSchemaComponent,
  type DatabaseSchemaComponent,
  type DatabaseSchemaTables,
  indexComponent,
  type IndexComponent,
  type SchemaExtensions,
  type TableColumns,
  type TableIndexes,
  type TableRelationships,
  tableComponent,
  type TableComponent,
} from '../components';
import {
  extensionComponent,
  type ExtensionComponents,
} from '../extensionComponent';
import {
  schemaComponentType,
  type SchemaComponentOptions,
} from '../schemaComponent';

const dumboColumn = <
  const ColumnType extends AnyColumnTypeToken | string,
  const Options extends Omit<ColumnSchemaComponentOptions<ColumnType>, 'type'> =
    Omit<ColumnSchemaComponentOptions<ColumnType>, 'type'>,
  const ColumnName extends string = string,
>(
  name: ColumnName,
  type: ColumnType,
  options?: Options,
): ColumnSchemaComponent<ColumnType, ColumnName> &
  (Options extends { notNull: true } | { primaryKey: true }
    ? { notNull: true }
    : { notNull?: false }) =>
  columnSchemaComponent<ColumnType, Options & { type: ColumnType }, ColumnName>(
    {
      columnName: name,
      type,
      ...options,
    } as { columnName: ColumnName; type: ColumnType } & Options,
  );

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
    databaseSchemaName?: string;
    columns?: Columns;
    primaryKey?: ReadonlyArray<Extract<keyof Columns, string>>;
    relationships?: Relationships;
    indexes?: Indexes;
  }> &
    Omit<SchemaComponentOptions, 'components'> = {},
): TableComponent<Columns, TableName, Indexes, Relationships> =>
  tableComponent({
    tableName: name,
    ...definition,
  });

const dumboDatabaseSchema = <
  const Tables extends DatabaseSchemaTables,
  const Name extends string,
  const Extensions extends SchemaExtensions = SchemaExtensions,
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

const dumboDefaultDatabaseSchema = <
  const Tables extends DatabaseSchemaTables,
  const Extensions extends SchemaExtensions = SchemaExtensions,
>(
  tables: Tables,
  extensions?: Extensions,
): DatabaseSchemaComponent<Tables, SQLDefaultSchemaNameToken, Extensions> =>
  databaseSchemaComponent<Tables, SQLDefaultSchemaNameToken, Extensions>({
    schemaName: SQLDefaultSchemaNameToken.from(),
    tables,
    extensions,
  });

dumboDatabaseSchema.from = (
  schemaName: string,
  tableNames: string[],
): DatabaseSchemaComponent =>
  dumboDatabaseSchema(
    schemaName,
    Object.fromEntries(
      tableNames.map((tableName) => [tableName, dumboTable(tableName)]),
    ),
  );

type ValidatedDatabaseComponent<
  Schemas extends DatabaseSchemas,
  DatabaseName extends string | undefined,
  Extensions extends DatabaseExtensions,
> =
  ValidateDatabaseSchemas<Schemas> extends { valid: true }
    ? DatabaseComponent<Schemas, DatabaseName, Extensions>
    : ValidateDatabaseSchemas<Schemas> extends {
          valid: false;
          error: infer ErrorType;
        }
      ? { valid: false; error: ErrorType }
      : DatabaseComponent<Schemas, DatabaseName, Extensions>;

function dumboDatabase<
  const Schemas extends DatabaseSchemas,
  const Extensions extends DatabaseExtensions = DatabaseExtensions,
>(
  schemas: Schemas,
  extensions?: Extensions,
): ValidatedDatabaseComponent<Schemas, undefined, Extensions>;
function dumboDatabase<
  const Name extends string,
  const Schema extends AnyDatabaseSchemaComponent & { schemaName: string },
>(
  name: Name,
  schema: Schema,
): DatabaseComponent<Record<Schema['schemaName'], Schema>, Name>;
function dumboDatabase<
  const Name extends string,
  const Schemas extends DatabaseSchemas,
  const Extensions extends DatabaseExtensions = DatabaseExtensions,
>(
  name: Name,
  schemas: Schemas,
  extensions?: Extensions,
): ValidatedDatabaseComponent<Schemas, Name, Extensions>;
function dumboDatabase(
  nameOrSchemas: string | DatabaseSchemas,
  schemasOrExtensions?:
    | DatabaseSchemas
    | DatabaseExtensions
    | (AnyDatabaseSchemaComponent & { schemaName: string }),
  extensions?: DatabaseExtensions,
): unknown {
  if (typeof nameOrSchemas === 'string') {
    const schemas: DatabaseSchemas =
      schemasOrExtensions !== undefined &&
      'schemaName' in schemasOrExtensions &&
      typeof schemasOrExtensions.schemaName === 'string'
        ? {
            [schemasOrExtensions.schemaName]:
              schemasOrExtensions as AnyDatabaseSchemaComponent,
          }
        : ((schemasOrExtensions ?? {}) as DatabaseSchemas);
    return databaseComponent({
      databaseName: nameOrSchemas,
      schemas,
      extensions,
    });
  }
  return databaseComponent({
    databaseName: undefined,
    schemas: nameOrSchemas,
    extensions: schemasOrExtensions as DatabaseExtensions | undefined,
  });
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
    ? dumboDatabase(schemas)
    : dumboDatabase(databaseName, schemas);
};

const dumboExtension = <const Name extends string>(
  name: Name,
  components: ExtensionComponents,
): ReturnType<typeof extensionComponent<Name>> =>
  extensionComponent(name, components);

export const dumboSchema = {
  database: dumboDatabase,
  schema: dumboDatabaseSchema,
  defaultSchema: dumboDefaultDatabaseSchema,
  table: dumboTable,
  column: dumboColumn,
  index: dumboIndex,
  extension: dumboExtension,
};

void schemaComponentType;
