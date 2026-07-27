import {
  extendSchemaComponent,
  type DatabaseDriverType,
  type SchemaComponentOptions,
  type TableURN,
} from '@event-driven-io/dumbo';
import type { PongoCollectionSchema, PongoCollectionSQLBuilder } from '..';
import type { PongoCollectionTableKind } from '../schema';

export type PongoCollectionURN<
  DatabaseSchemaName extends string = string,
  TableName extends string = string,
> = TableURN<PongoCollectionTableKind, DatabaseSchemaName, TableName>;

export type PongoCollectionSchemaComponent = PongoCollectionSchema & {
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
    sqlBuilder,
    definition,
    collectionName: definition.tableName,
    databaseSchemaName: definition.databaseSchemaName,
  };
};
