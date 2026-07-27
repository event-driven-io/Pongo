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
  IndexName extends string = string,
> = `${IndexURNType}:${IndexKind}:${IndexName}`;

export type RegularIndexKind = 'regular';
export const RegularIndexKind: RegularIndexKind = 'regular';

export type IndexSQLContext = {
  databaseSchemaName: string;
  tableName: string;
  tableReference: SQL;
};

export type IndexSchemaComponent<
  IndexKind extends string = RegularIndexKind,
  IndexName extends string = string,
  AdditionalData extends Record<string, unknown> = Record<string, never>,
> = SchemaComponent<
  IndexURN<IndexKind, IndexName>,
  Readonly<{
    indexKind: IndexKind;
    indexName: IndexName;
    columnNames: ReadonlyArray<string>;
    isUnique: boolean;
    sql?: ((context: IndexSQLContext) => SQL) | undefined;
    addColumn: (column: string | ColumnSchemaComponent) => void;
  }> &
    AdditionalData
>;

export const IndexURNType: IndexURNType = 'sc:dumbo:index';
export const IndexURN = <
  IndexKind extends string = string,
  IndexName extends string = string,
>({
  kind,
  name,
}: {
  kind: IndexKind;
  name: IndexName;
}): IndexURN<IndexKind, IndexName> => `${IndexURNType}:${kind}:${name}`;

export const indexSchemaComponent = <
  const IndexKind extends string = RegularIndexKind,
  const IndexName extends string = string,
  const AdditionalData extends Record<string, unknown> = Record<string, never>,
>({
  indexName,
  indexKind,
  columnNames,
  isUnique,
  sql,
  additionalData,
  ...migrationsOrComponents
}: {
  indexName: IndexName;
  indexKind?: IndexKind;
  columnNames: string[];
  isUnique: boolean;
  sql?: ((context: IndexSQLContext) => SQL) | undefined;
  additionalData?: AdditionalData | undefined;
} & SchemaComponentOptions): IndexSchemaComponent<
  IndexKind,
  IndexName,
  AdditionalData
> => {
  indexKind ??= RegularIndexKind as IndexKind;
  additionalData ??= {} as AdditionalData;
  const sc = schemaComponent(IndexURN({ kind: indexKind, name: indexName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [...(migrationsOrComponents.components ?? [])],
  });

  return {
    ...sc,
    ...additionalData,
    indexKind,
    indexName,
    get columnNames() {
      return columnNames;
    },
    sql,
    addColumn: (column: string | ColumnSchemaComponent) =>
      columnNames.push(typeof column === 'string' ? column : column.columnName),
    isUnique,
  } as unknown as IndexSchemaComponent<IndexKind, IndexName, AdditionalData>;
};
