import {
  dumboSchema,
  schemaComponent,
  type DatabaseDriverType,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '@event-driven-io/dumbo';
import type { PongoCollectionSchema, PongoCollectionSQLBuilder } from '..';

export type PongoCollectionURNType = 'sc:pongo:collection';
export type PongoCollectionURN =
  `${PongoCollectionURNType}:${string}:${string}`;

export type PongoCollectionSchemaComponent =
  SchemaComponent<PongoCollectionURN> & {
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
  const databaseSchemaName =
    definition.databaseSchema ?? dumboSchema.schema.defaultName;

  return {
    ...schemaComponent(
      `sc:pongo:collection:${databaseSchemaName}:${definition.name}`,
      {
        ...(migrations !== undefined ? { migrations } : {}),
        ...(components !== undefined ? { components } : {}),
      },
    ),
    sqlBuilder,
    definition,
    collectionName: definition.name,
    databaseSchemaName,
  };
};
