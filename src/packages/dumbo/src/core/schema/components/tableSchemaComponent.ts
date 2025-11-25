import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  ColumnURNType,
  type AnyColumnSchemaComponent,
} from './columnSchemaComponent';
import {
  IndexURNType,
  type IndexSchemaComponent,
} from './indexSchemaComponent';
import type { RelationshipDefinition } from './relationships/relationshipTypes';
import type { TableColumnNames } from './tableTypesInference';

export type TableURNType = 'sc:dumbo:table';
export type TableURN = `${TableURNType}:${string}`;

export const TableURNType: TableURNType = 'sc:dumbo:table';
export const TableURN = ({ name }: { name: string }): TableURN =>
  `${TableURNType}:${name}`;

export type TableColumns = Record<string, AnyColumnSchemaComponent>;
export type TableRelationships<
  Columns extends string = string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  FKS extends RelationshipDefinition<Columns, any> = RelationshipDefinition<
    Columns,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
  >,
> =
  FKS extends RelationshipDefinition<infer C, infer R>
    ? readonly RelationshipDefinition<C, R>[]
    : never;

export type TableSchemaComponent<
  Columns extends TableColumns = TableColumns,
  Relationships extends TableRelationships<
    keyof Columns & string
  > = TableRelationships<keyof Columns & string>,
> = SchemaComponent<
  TableURN,
  Readonly<{
    tableName: string;
    columns: ReadonlyMap<string, AnyColumnSchemaComponent> & Columns;
    primaryKey: TableColumnNames<
      TableSchemaComponent<Columns, Relationships>
    >[];
    relationships: Relationships;
    indexes: ReadonlyMap<string, IndexSchemaComponent>;
    addColumn: (column: AnyColumnSchemaComponent) => AnyColumnSchemaComponent;
    addIndex: (index: IndexSchemaComponent) => IndexSchemaComponent;
  }>
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTableSchemaComponent = TableSchemaComponent<any, any>;

export const tableSchemaComponent = <
  Columns extends TableColumns = TableColumns,
  const Relationships extends TableRelationships = TableRelationships,
>({
  tableName,
  columns,
  primaryKey,
  relationships,
  ...migrationsOrComponents
}: {
  tableName: string;
  columns?: Columns;
  primaryKey?: TableColumnNames<TableSchemaComponent<Columns, Relationships>>[];
  relationships?: Relationships;
} & SchemaComponentOptions): TableSchemaComponent<Columns, Relationships> & {
  relationships: Relationships;
} => {
  columns ??= {} as Columns;
  relationships ??= {} as Relationships;

  const base = schemaComponent(TableURN({ name: tableName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [
      ...(migrationsOrComponents.components ?? []),
      ...Object.values(columns),
    ],
  });

  return {
    ...base,
    tableName,
    primaryKey: primaryKey ?? [],
    relationships,
    get columns() {
      const columnsMap = mapSchemaComponentsOfType<AnyColumnSchemaComponent>(
        base.components,
        ColumnURNType,
        (c) => c.columnName,
      );

      return Object.assign(columnsMap, columns);
    },
    get indexes() {
      return mapSchemaComponentsOfType<IndexSchemaComponent>(
        base.components,
        IndexURNType,
        (c) => c.indexName,
      );
    },
    addColumn: (column: AnyColumnSchemaComponent) => base.addComponent(column),
    addIndex: (index: IndexSchemaComponent) => base.addComponent(index),
  } as TableSchemaComponent<Columns, Relationships> & {
    relationships: Relationships;
  };
};
