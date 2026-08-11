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
  dedupeMigrations,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentContext,
  type SchemaComponentOptions,
} from '../schemaComponent';
import { sqlMigration } from '../sqlMigration';
import { indexMigrationName } from './migrationNames';

export const indexComponentType: unique symbol = Symbol(
  'dumbo.schemaComponent.index',
);

export const jsonPathIndexTargetType: unique symbol = Symbol(
  'dumbo.indexTarget.jsonPath',
);
export const jsonDocumentIndexTargetType: unique symbol = Symbol(
  'dumbo.indexTarget.jsonDocument',
);

export type JSONPathIndexTarget<
  Path extends string | readonly string[] = string | readonly string[],
> = Readonly<{
  [jsonPathIndexTargetType]: true;
  columnName: string;
  path: Path;
}>;

export type JSONDocumentIndexTarget = Readonly<{
  [jsonDocumentIndexTargetType]: true;
  columnName: string;
}>;

export type IndexTarget = JSONPathIndexTarget | JSONDocumentIndexTarget;

export const jsonPathIndexTarget = <
  const Path extends string | readonly string[],
>(
  columnName: string,
  path: Path,
): JSONPathIndexTarget<Path> =>
  Object.freeze({
    [jsonPathIndexTargetType]: true as const,
    columnName,
    path,
  });

export const jsonDocumentIndexTarget = (
  columnName: string,
): JSONDocumentIndexTarget =>
  Object.freeze({
    [jsonDocumentIndexTargetType]: true as const,
    columnName,
  });

export const isJSONPathIndexTarget = (
  target: IndexTarget,
): target is JSONPathIndexTarget => jsonPathIndexTargetType in target;

export const isJSONDocumentIndexTarget = (
  target: IndexTarget,
): target is JSONDocumentIndexTarget => jsonDocumentIndexTargetType in target;

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
    databaseSchemaName?: string | undefined;
    tableName?: string | undefined;
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
  databaseSchemaName?: string | undefined;
  tableName?: string | undefined;
  columnNames: ColumnNames;
  isUnique: boolean;
  target?: IndexTarget | undefined;
  sql?: ((context: IndexSQLContext) => SQL) | undefined;
}> &
  Omit<SchemaComponentOptions, 'components'>;

export type IndexIdentifier = Omit<SQLIndexReference, 'sqlTokenType'>;

const indexTargetSQL = (index: AnyIndexComponent): SQLStatement => {
  const target = index.target;

  if (target !== undefined && isJSONDocumentIndexTarget(target))
    return SQL`${SQLJSONDocumentIndexTarget.from({
      columnName: target.columnName,
      isUnique: index.isUnique,
    })}`;

  if (target !== undefined && isJSONPathIndexTarget(target))
    return SQL`${SQLJSONPathTarget.from({
      columnName: target.columnName,
      path:
        typeof target.path === 'string' ? target.path : target.path.join('.'),
    })}`;

  return SQL`(${SQL.merge(
    index.columnNames.map((columnName) => SQL`${SQL.identifier(columnName)}`),
    ', ',
  )})`;
};

export const createIndexSQL = (
  index: AnyIndexComponent,
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

export const indexComponent = <
  const IndexName extends string,
  const ColumnNames extends readonly string[],
>(
  options: IndexComponentOptions<IndexName, ColumnNames>,
): IndexComponent<IndexName, ColumnNames> => {
  const children: ReadonlyArray<AnySchemaComponent> = Object.freeze([]);
  const kind = options.kind ?? 'relational';

  const component: IndexComponent<IndexName, ColumnNames> = {
    [schemaComponentType]: indexComponentType,
    indexName: options.indexName,
    indexTargetNames: Object.freeze([
      ...(options.indexTargetNames ?? options.columnNames),
    ]),
    columnNames: Object.freeze([...options.columnNames]) as ColumnNames,
    isUnique: options.isUnique,
    target: options.target,
    databaseSchemaName: options.databaseSchemaName,
    tableName: options.tableName,
    sql: options.sql,
    components: children,
    migrations: (context: SchemaComponentContext = {}) => {
      const tableName = options.tableName ?? context.tableName;
      const identifier =
        tableName === undefined
          ? undefined
          : {
              databaseSchemaName:
                options.databaseSchemaName ??
                context.databaseSchemaName ??
                SQLDefaultSchemaNameToken.from(),
              tableName,
              indexName: options.indexName,
            };

      return dedupeMigrations([
        ...(identifier === undefined
          ? []
          : [
              sqlMigration(indexMigrationName(identifier, kind), [
                createIndexSQL(component, identifier),
              ]),
            ]),
        ...(options.migrations?.(context) ?? []),
        ...children.flatMap((child) => child.migrations(context)),
      ]);
    },
  };

  return component;
};

export const isIndexComponent = (
  component: AnySchemaComponent,
): component is AnyIndexComponent =>
  component[schemaComponentType] === indexComponentType;

export const generatedIndexNameSegment = (value: string): string =>
  value
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

export const generatedIndexName = ({
  tableName,
  indexTargetNames,
  indexKind,
}: {
  tableName: string;
  indexTargetNames: ReadonlyArray<string>;
  indexKind: string;
}): string =>
  [
    generatedIndexNameSegment(tableName),
    ...indexTargetNames.map(generatedIndexNameSegment),
    generatedIndexNameSegment(indexKind),
    'idx',
  ].join('_');
