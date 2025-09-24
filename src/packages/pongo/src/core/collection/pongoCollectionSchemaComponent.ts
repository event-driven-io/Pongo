import {
  schemaComponent,
  type DatabaseDriverType,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '@event-driven-io/dumbo';
import type { PongoCollectionSchema, PongoCollectionSQLBuilder } from '..';

export type PongoCollectionSchemaComponent =
  SchemaComponent<'pongo:schema-component:collection'> & {
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
      'pongo:schema-component:collection',
      migrationsOrSchemaComponents,
    ),
    sqlBuilder,
    definition,
    collectionName: definition.name,
  }) as PongoCollectionSchemaComponent;
