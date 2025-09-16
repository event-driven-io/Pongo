import { schemaComponent } from '@event-driven-io/dumbo';
import type { PongoSchemaComponentOptions } from '../../../core';
import { pongoCollectionPostgreSQLMigrations } from '../../postgresql';

export const pongoCollectionSchemaComponent = (
  options: PongoSchemaComponentOptions,
) =>
  schemaComponent('pongo:schema_component:collection', {
    migrations: pongoCollectionPostgreSQLMigrations(options.collectionName), // TODO: This needs to change to support more connectors
  });
