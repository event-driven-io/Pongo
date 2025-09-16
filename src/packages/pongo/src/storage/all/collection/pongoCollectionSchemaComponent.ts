import {
  schemaComponent,
  type ConnectorType,
  type SchemaComponent,
} from '@event-driven-io/dumbo';
import type {
  PongoCollectionSQLBuilder,
  PongoCollectionSchemaComponentOptions,
} from '../../../core';
import { pongoCollectionPostgreSQLMigrations } from '../../postgresql';

export type PongoCollectionSchemaComponent =
  SchemaComponent<'pongo:schema-component:collection'> &
    PongoCollectionSQLBuilder;

export const PongoCollectionSchemaComponent = <
  Connector extends ConnectorType = ConnectorType,
>(
  options: PongoCollectionSchemaComponentOptions<Connector>,
): PongoCollectionSchemaComponent =>
  schemaComponent('pongo:schema-component:collection', {
    migrations: pongoCollectionPostgreSQLMigrations(options.collectionName), // TODO: This needs to change to support more connectors
  }) as PongoCollectionSchemaComponent;

PongoCollectionSchemaComponent.from = <
  Connector extends ConnectorType = ConnectorType,
>(
  connector: Connector,
  collections: string[],
): PongoCollectionSchemaComponent[] =>
  collections.map((collectionName) =>
    PongoCollectionSchemaComponent({
      connector,
      collectionName: collectionName,
    }),
  );
