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
  } & PongoCollectionSQLBuilder;

export type PongoCollectionSchemaComponentOptions<
  Connector extends ConnectorType = ConnectorType,
> = Readonly<{
  definition: PongoCollectionSchema;
  connector: Connector;
  migrationsOrSchemaComponents: SchemaComponentOptions;
}>;

// export type PongoCollectionSchemaComponentOptions = <
//   Connector extends ConnectorType = ConnectorType,
// >(
//   connector: Connector,
//   existingCollections: PongoCollectionSchemaComponent[],
// ) => PongoCollectionSchemaComponent;

export const PongoCollectionSchemaComponent = <
  Connector extends ConnectorType = ConnectorType,
>({
  definition,
  migrationsOrSchemaComponents,
}: PongoCollectionSchemaComponentOptions<Connector>): PongoCollectionSchemaComponent =>
  ({
    ...schemaComponent(
      'pongo:schema-component:collection',
      migrationsOrSchemaComponents,
    ),
    //   {
    //   migrations: pongoCollectionPostgreSQLMigrations(collectionName), // TODO: This needs to change to support more connectors
    // }),
    definition,
    get collectionName() {
      return this.definition.name;
    },
  }) as PongoCollectionSchemaComponent;
