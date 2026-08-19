import {
  SQL,
  SQLDefaultSchemaNameToken,
  SQLIndexReference,
  SQLJSONDocumentIndexTarget,
  SQLJSONPathTarget,
  SQLTableReference,
  type SQL as SQLStatement,
} from '../../sql';
import {
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentContext,
} from '../schemaComponent';
import { sqlMigration, type SQLMigration } from '../sqlMigration';
import type { IndexTarget } from './indexTarget';
import { migrationName, schemaSegments } from './migrationName';

export const indexComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.index',
);

const indexMigrationName = (
  identifier: Readonly<{
    databaseSchemaName: string | SQLDefaultSchemaNameToken | undefined;
    tableName: string;
    indexName: string;
  }>,
  kind: string | undefined,
): string =>
  migrationName(
    'index',
    kind,
    [
      ...schemaSegments(identifier.databaseSchemaName),
      identifier.tableName,
      identifier.indexName,
    ],
    'create',
  );

export type IndexSQLContext = Readonly<{
  databaseSchemaName: string | SQLDefaultSchemaNameToken;
  tableName: string;
  indexName: string;
  tableReference: SQL;
  indexReference: SQL;
}>;

export type IndexComponent<
  IndexName extends string = string,
  ColumnNames extends readonly string[] = readonly string[],
> = SchemaComponent<typeof indexComponentType> &
  Readonly<{
    indexName: IndexName;
    indexTargetNames: ReadonlyArray<string>;
    columnNames: ColumnNames;
    isUnique: boolean;
    target?: IndexTarget | undefined;
    sql?: ((context: IndexSQLContext) => SQL) | undefined;
  }>;

export type AnyIndexComponent = IndexComponent<string, readonly string[]>;

export type IndexComponentOptions<
  IndexName extends string,
  ColumnNames extends readonly string[],
> = Readonly<{
  indexName: IndexName;
  kind?: string | undefined;
  indexTargetNames?: ReadonlyArray<string> | undefined;
  columnNames: ColumnNames;
  isUnique: boolean;
  target?: IndexTarget | undefined;
  sql?: ((context: IndexSQLContext) => SQL) | undefined;
  migrations?:
    | ((context: SchemaComponentContext) => ReadonlyArray<SQLMigration>)
    | undefined;
}>;

type IndexIdentifier = Omit<SQLIndexReference, 'sqlTokenType'>;

const indexTargetSQL = (
  index: Readonly<{
    columnNames: ReadonlyArray<string>;
    isUnique: boolean;
    target?: IndexTarget | undefined;
  }>,
): SQLStatement => {
  const target = index.target;

  if (target?.targetType === 'jsonDocument')
    return SQL`${SQLJSONDocumentIndexTarget.from({
      columnName: target.columnName,
      isUnique: index.isUnique,
    })}`;

  if (target?.targetType === 'jsonPath')
    return SQL`${SQLJSONPathTarget.from({
      columnName: target.columnName,
      path:
        typeof target.path === 'string' ? target.path.split('.') : target.path,
    })}`;

  return SQL`(${SQL.merge(
    index.columnNames.map((columnName) => SQL`${SQL.identifier(columnName)}`),
    ', ',
  )})`;
};

export const createIndexSQL = (
  index: Readonly<{
    columnNames: ReadonlyArray<string>;
    isUnique: boolean;
    target?: IndexTarget | undefined;
    sql?: ((context: IndexSQLContext) => SQL) | undefined;
  }>,
  identifier: IndexIdentifier,
): SQLStatement => {
  const tableReference = SQL`${SQLTableReference.from(identifier)}`;
  const indexReference = SQL`${SQLIndexReference.from(identifier)}`;

  if (index.sql !== undefined)
    return index.sql({ ...identifier, tableReference, indexReference });

  const target = indexTargetSQL(index);

  return index.isUnique
    ? SQL`CREATE UNIQUE INDEX IF NOT EXISTS ${indexReference} ON ${tableReference} ${target}`
    : SQL`CREATE INDEX IF NOT EXISTS ${indexReference} ON ${tableReference} ${target}`;
};

const generatedIndexMigrations = (
  identifier: IndexIdentifier,
  index: Readonly<{
    kind?: string | undefined;
    columnNames: ReadonlyArray<string>;
    isUnique: boolean;
    target?: IndexTarget | undefined;
    sql?: ((context: IndexSQLContext) => SQL) | undefined;
  }>,
): ReadonlyArray<SQLMigration> => [
  sqlMigration(indexMigrationName(identifier, index.kind), [
    createIndexSQL(index, identifier),
  ]),
];

export const indexComponent = <
  const IndexName extends string,
  const ColumnNames extends readonly string[],
>(
  options: IndexComponentOptions<IndexName, ColumnNames>,
): IndexComponent<IndexName, ColumnNames> => {
  const ownMigrations = (context: SchemaComponentContext) => {
    const tableName = context.tableName;
    if (tableName === undefined)
      throw new Error(
        `Index "${options.indexName}" cannot be created outside a table. Declare it in the indexes of the table it belongs to`,
      );

    if (options.migrations !== undefined) return options.migrations(context);

    return generatedIndexMigrations(
      {
        databaseSchemaName:
          context.databaseSchemaName ?? SQLDefaultSchemaNameToken.from(),
        tableName,
        indexName: options.indexName,
      },
      options,
    );
  };

  const component: IndexComponent<IndexName, ColumnNames> = {
    ...schemaComponent(indexComponentType, {
      migrations: ownMigrations,
    }),
    indexName: options.indexName,
    indexTargetNames: Object.freeze([
      ...(options.indexTargetNames ?? options.columnNames),
    ]),
    columnNames: Object.freeze([...options.columnNames]) as ColumnNames,
    isUnique: options.isUnique,
    target: options.target,
    sql: options.sql,
  };

  return component;
};
