import {
  extendSchemaComponent,
  type DatabaseDriverType,
  type SchemaComponentOptions,
} from '@event-driven-io/dumbo';
import type { PongoCollectionSchema, PongoCollectionSQLBuilder } from '..';

export type PongoCollectionURNType = 'sc:pongo:collection';
export type PongoCollectionURN =
  `${PongoCollectionURNType}:${string}:${string}`;

export type PongoCollectionSchemaComponent = PongoCollectionSchema & {
  pongoCollectionComponentKey: PongoCollectionURN;
  collectionName: string;
  databaseSchemaName?: string | undefined;
  definition: PongoCollectionSchema;
  sqlBuilder: PongoCollectionSQLBuilder;
};

export type PongoCollectionSchemaComponentOptions<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = Readonly<
  {
    driverType: DriverType;
    definition: PongoCollectionSchema;
    sqlBuilder: PongoCollectionSQLBuilder;
  } & SchemaComponentOptions
>;

export const PongoCollectionSchemaComponent = <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
>({
  definition,
  migrations,
  components,
  sqlBuilder,
}: PongoCollectionSchemaComponentOptions<DriverType>): PongoCollectionSchemaComponent => {
  const table = extendSchemaComponent(definition, {
    ...(migrations !== undefined ? { migrations } : {}),
    ...(components !== undefined ? { components } : {}),
  });

  return {
    ...table,
    pongoCollectionComponentKey: `sc:pongo:collection:${definition.databaseSchemaName}:${definition.tableName}`,
    sqlBuilder,
    definition,
    collectionName: definition.tableName,
    databaseSchemaName: definition.databaseSchemaName,
  };
};
