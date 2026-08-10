import type { SQL } from '../../sql';
import {
  createSchemaComponent,
  schemaComponentType,
  type AnySchemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';

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
  databaseSchemaName: string;
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
    databaseSchemaName?: string;
    tableName?: string;
    target?: IndexTarget;
    sql?: ((context: IndexSQLContext) => SQL) | undefined;
  }>;

export type AnyIndexComponent = IndexComponent<string, readonly string[]>;

export type IndexComponentOptions<
  IndexName extends string,
  ColumnNames extends readonly string[],
> = Readonly<{
  indexName: IndexName;
  indexTargetNames?: ReadonlyArray<string> | undefined;
  databaseSchemaName?: string | undefined;
  tableName?: string | undefined;
  columnNames: ColumnNames;
  isUnique: boolean;
  target?: IndexTarget | undefined;
  sql?: ((context: IndexSQLContext) => SQL) | undefined;
}> &
  Omit<SchemaComponentOptions, 'components'>;

export const indexComponent = <
  const IndexName extends string,
  const ColumnNames extends readonly string[],
>(
  options: IndexComponentOptions<IndexName, ColumnNames>,
): IndexComponent<IndexName, ColumnNames> => {
  const base = createSchemaComponent(
    indexComponentType,
    {
      migrations: options.migrations,
    },
    {
      indexName: options.indexName,
      indexTargetNames: Object.freeze([
        ...(options.indexTargetNames ?? options.columnNames),
      ]),
      columnNames: Object.freeze([...options.columnNames]),
      isUnique: options.isUnique,
      target: options.target,
      databaseSchemaName: options.databaseSchemaName,
      tableName: options.tableName,
      sql: options.sql,
    },
  );

  return base as unknown as IndexComponent<IndexName, ColumnNames>;
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
