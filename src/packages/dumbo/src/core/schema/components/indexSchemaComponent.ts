import {
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import type { SQL } from '../../sql';
import type { ColumnSchemaComponent } from './columnSchemaComponent';

export type IndexURNType = 'sc:dumbo:index';
export type IndexURN<
  IndexKind extends string = string,
  DatabaseSchemaName extends string = string,
  TableName extends string = string,
  IndexName extends string = string,
> = `${IndexURNType}:${IndexKind}:${DatabaseSchemaName}:${TableName}:${IndexName}`;

export type RegularIndexKind = 'regular';
export const RegularIndexKind: RegularIndexKind = 'regular';
export const DEFAULT_INDEX_DATABASE_SCHEMA_NAME = '__default_database_schema__';
export const DEFAULT_INDEX_TABLE_NAME = '__default_table__';

export type IndexSQLContext = {
  databaseSchemaName: string;
  tableName: string;
  tableReference: SQL;
};

export type IndexSchemaComponent<
  IndexKind extends string = RegularIndexKind,
  DatabaseSchemaName extends string = string,
  TableName extends string = string,
  IndexName extends string = string,
  AdditionalData extends Record<string, unknown> = Record<string, never>,
> = SchemaComponent<
  IndexURN<IndexKind, DatabaseSchemaName, TableName, IndexName>,
  Readonly<{
    indexKind: IndexKind;
    databaseSchemaName: DatabaseSchemaName;
    tableName: TableName;
    indexName: IndexName;
    columnNames: ReadonlyArray<string>;
    isUnique: boolean;
    sql?: ((context: IndexSQLContext) => SQL) | undefined;
    addColumn: (column: string | ColumnSchemaComponent) => void;
  }> &
    AdditionalData
>;

export type AnyIndexSchemaComponent = IndexSchemaComponent<
  string,
  string,
  string,
  string,
  Record<string, unknown>
>;

export const IndexURNType: IndexURNType = 'sc:dumbo:index';
export const IndexURN = <
  IndexKind extends string = string,
  DatabaseSchemaName extends string = string,
  TableName extends string = string,
  IndexName extends string = string,
>({
  kind,
  databaseSchemaName,
  tableName,
  name,
}: {
  kind: IndexKind;
  databaseSchemaName: DatabaseSchemaName;
  tableName: TableName;
  name: IndexName;
}): IndexURN<IndexKind, DatabaseSchemaName, TableName, IndexName> =>
  `${IndexURNType}:${kind}:${databaseSchemaName}:${tableName}:${name}`;

export const indexSchemaComponent = <
  const IndexKind extends string = RegularIndexKind,
  const DatabaseSchemaName extends string =
    typeof DEFAULT_INDEX_DATABASE_SCHEMA_NAME,
  const TableName extends string = typeof DEFAULT_INDEX_TABLE_NAME,
  const IndexName extends string = string,
  const AdditionalData extends Record<string, unknown> = Record<string, never>,
>({
  indexName,
  indexKind,
  databaseSchemaName,
  tableName,
  columnNames,
  isUnique,
  sql,
  additionalData,
  ...migrationsOrComponents
}: {
  indexName: IndexName;
  indexKind?: IndexKind;
  databaseSchemaName?: DatabaseSchemaName;
  tableName?: TableName;
  columnNames: string[];
  isUnique: boolean;
  sql?: ((context: IndexSQLContext) => SQL) | undefined;
  additionalData?: AdditionalData | undefined;
} & SchemaComponentOptions): IndexSchemaComponent<
  IndexKind,
  DatabaseSchemaName,
  TableName,
  IndexName,
  AdditionalData
> => {
  indexKind ??= RegularIndexKind as IndexKind;
  databaseSchemaName ??=
    DEFAULT_INDEX_DATABASE_SCHEMA_NAME as DatabaseSchemaName;
  tableName ??= DEFAULT_INDEX_TABLE_NAME as TableName;
  additionalData ??= {} as AdditionalData;
  const sc = schemaComponent(
    IndexURN({
      kind: indexKind,
      databaseSchemaName,
      tableName,
      name: indexName,
    }),
    {
      migrations: migrationsOrComponents.migrations ?? [],
      components: [...(migrationsOrComponents.components ?? [])],
    },
  );

  return {
    ...sc,
    ...additionalData,
    get components() {
      return sc.components;
    },
    get migrations() {
      return sc.migrations;
    },
    indexKind,
    databaseSchemaName,
    tableName,
    indexName,
    get columnNames() {
      return columnNames;
    },
    sql,
    addColumn: (column: string | ColumnSchemaComponent) =>
      columnNames.push(typeof column === 'string' ? column : column.columnName),
    isUnique,
  } as unknown as IndexSchemaComponent<
    IndexKind,
    DatabaseSchemaName,
    TableName,
    IndexName,
    AdditionalData
  >;
};

export const bindIndexToTable = <
  const Index extends AnyIndexSchemaComponent,
  const DatabaseSchemaName extends string,
  const TableName extends string,
>(
  index: Index,
  databaseSchemaName: DatabaseSchemaName,
  tableName: TableName,
): IndexSchemaComponent<
  Index['indexKind'],
  DatabaseSchemaName,
  TableName,
  Index['indexName'],
  Record<string, unknown>
> &
  Omit<Index, 'schemaComponentKey' | 'databaseSchemaName' | 'tableName'> => {
  if (
    index.databaseSchemaName !== DEFAULT_INDEX_DATABASE_SCHEMA_NAME &&
    index.databaseSchemaName !== databaseSchemaName
  ) {
    throw new Error(
      `Index ${index.indexName} belongs to database schema ${index.databaseSchemaName} and cannot be added to ${databaseSchemaName}.${tableName}`,
    );
  }

  if (
    index.tableName !== DEFAULT_INDEX_TABLE_NAME &&
    index.tableName !== tableName
  ) {
    throw new Error(
      `Index ${index.indexName} belongs to table ${index.databaseSchemaName}.${index.tableName} and cannot be added to ${databaseSchemaName}.${tableName}`,
    );
  }

  if (
    index.databaseSchemaName === databaseSchemaName &&
    index.tableName === tableName
  ) {
    return index as unknown as IndexSchemaComponent<
      Index['indexKind'],
      DatabaseSchemaName,
      TableName,
      Index['indexName'],
      Record<string, unknown>
    > &
      Omit<Index, 'schemaComponentKey' | 'databaseSchemaName' | 'tableName'>;
  }

  return {
    ...index,
    schemaComponentKey: IndexURN({
      kind: index.indexKind,
      databaseSchemaName,
      tableName,
      name: index.indexName,
    }),
    databaseSchemaName,
    tableName,
    get components() {
      return index.components;
    },
    get migrations() {
      return index.migrations;
    },
    addComponent: index.addComponent,
    addMigration: index.addMigration,
  };
};
