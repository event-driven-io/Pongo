import {
  schemaComponent,
  type DatabaseDriverType,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '@event-driven-io/dumbo';
import type { PongoCollectionSchema, PongoCollectionSQLBuilder } from '..';

export type PongoCollectionURNType = 'sc:pongo:collection';
export type PongoCollectionURN = `${PongoCollectionURNType}:${string}`;

export type PongoCollectionSchemaComponent =
  SchemaComponent<PongoCollectionURN> & {
    collectionName: string;
    definition: PongoCollectionSchema;
    sqlBuilder: PongoCollectionSQLBuilder;
  };

export type PongoCollectionSchemaComponentOptions<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = Readonly<{
  driverType: DriverType;
  definition: PongoCollectionSchema;
  migrationsOrSchemaComponents: SchemaComponentOptions;
  sqlBuilder: PongoCollectionSQLBuilder;
}>;

export const PongoCollectionSchemaComponent = <
  DriverType extends DatabaseDriverType = DatabaseDriverType,
>({
  definition,
  migrationsOrSchemaComponents,
  sqlBuilder,
}: PongoCollectionSchemaComponentOptions<DriverType>): PongoCollectionSchemaComponent =>
  ({
    ...schemaComponent(
      `sc:pongo:collection:${definition.name}`,
      migrationsOrSchemaComponents,
    ),
    sqlBuilder,
    definition,
    collectionName: definition.name,
  }) as PongoCollectionSchemaComponent;
