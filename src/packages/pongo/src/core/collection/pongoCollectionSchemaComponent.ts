import {
  schemaComponent,
  type ConnectorType,
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
  Connector extends ConnectorType = ConnectorType,
> = Readonly<{
  definition: PongoCollectionSchema;
  connector: Connector;
  migrationsOrSchemaComponents: SchemaComponentOptions;
  sqlBuilder: PongoCollectionSQLBuilder;
}>;

export const PongoCollectionSchemaComponent = <
  Connector extends ConnectorType = ConnectorType,
>({
  definition,
  migrationsOrSchemaComponents,
  sqlBuilder,
}: PongoCollectionSchemaComponentOptions<Connector>): PongoCollectionSchemaComponent =>
  ({
    ...schemaComponent(
      'pongo:schema-component:collection',
      migrationsOrSchemaComponents,
    ),
    sqlBuilder,
    definition,
    collectionName: definition.name,
  }) as PongoCollectionSchemaComponent;
