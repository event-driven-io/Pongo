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
  SchemaComponent<'pongo:schema-component:collection'> & {
    collectionName: string;
  } & PongoCollectionSQLBuilder;

export const PongoCollectionSchemaComponent = <
  Connector extends ConnectorType = ConnectorType,
>({
  collectionName,
}: PongoCollectionSchemaComponentOptions<Connector>): PongoCollectionSchemaComponent =>
  ({
    ...schemaComponent('pongo:schema-component:collection', {
      migrations: pongoCollectionPostgreSQLMigrations(collectionName), // TODO: This needs to change to support more connectors
    }),
    collectionName,
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
      collectionName,
    }),
  );
