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

export type IndexSQLContext = Readonly<{
  databaseName: string;
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
  sql?: ((context: IndexSQLContext) => SQL) | undefined;
}> &
  Omit<SchemaComponentOptions, 'components'>;

export const indexComponent = <
  const IndexName extends string,
  const ColumnNames extends readonly string[],
>(
  options: IndexComponentOptions<IndexName, ColumnNames>,
): IndexComponent<IndexName, ColumnNames> => {
  const base = createSchemaComponent(indexComponentType, {
    migrations: options.migrations,
  });

  Object.defineProperties(base, {
    indexName: { value: options.indexName, enumerable: true },
    indexTargetNames: {
      value: Object.freeze([
        ...(options.indexTargetNames ?? options.columnNames),
      ]),
      enumerable: true,
    },
    columnNames: {
      value: Object.freeze([...options.columnNames]),
      enumerable: true,
    },
    isUnique: { value: options.isUnique, enumerable: true },
    databaseSchemaName: {
      value: options.databaseSchemaName,
      enumerable: true,
    },
    tableName: { value: options.tableName, enumerable: true },
    sql: { value: options.sql, enumerable: true },
  });

  return base as IndexComponent<IndexName, ColumnNames>;
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
