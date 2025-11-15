import {
  mapSchemaComponentsOfType,
  schemaComponent,
  type SchemaComponent,
  type SchemaComponentOptions,
} from '../schemaComponent';
import {
  DatabaseSchemaURNType,
  databaseSchemaSchemaComponent,
  type AnyDatabaseSchemaSchemaComponent,
  type DatabaseSchemaSchemaComponent,
} from './databaseSchemaSchemaComponent';

export type DatabaseURNType = 'sc:dumbo:database';
export type DatabaseURN = `${DatabaseURNType}:${string}`;

export const DatabaseURNType: DatabaseURNType = 'sc:dumbo:database';
export const DatabaseURN = ({ name }: { name: string }): DatabaseURN =>
  `${DatabaseURNType}:${name}`;

export type DatabaseSchemas<
  Schemas extends
    AnyDatabaseSchemaSchemaComponent = AnyDatabaseSchemaSchemaComponent,
> = Record<string, Schemas>;

export type DatabaseSchemaComponent<
  Schemas extends DatabaseSchemas = DatabaseSchemas,
> = SchemaComponent<
  DatabaseURN,
  Readonly<{
    databaseName: string;
    schemas: ReadonlyMap<string, DatabaseSchemaSchemaComponent> & Schemas;
    addSchema: (
      schema: string | DatabaseSchemaSchemaComponent,
    ) => DatabaseSchemaSchemaComponent;
  }>
>;

export const databaseSchemaComponent = <
  Schemas extends DatabaseSchemas = DatabaseSchemas,
>({
  databaseName,
  schemas,
  ...migrationsOrComponents
}: {
  databaseName: string;
  schemas?: Schemas;
} & SchemaComponentOptions): DatabaseSchemaComponent<Schemas> => {
  schemas ??= {} as Schemas;

  const base = schemaComponent(DatabaseURN({ name: databaseName }), {
    migrations: migrationsOrComponents.migrations ?? [],
    components: [
      ...(migrationsOrComponents.components ?? []),
      ...Object.values(schemas),
    ],
  });

  return {
    ...base,
    databaseName,
    get schemas() {
      const schemasMap =
        mapSchemaComponentsOfType<DatabaseSchemaSchemaComponent>(
          base.components,
          DatabaseSchemaURNType,
          (c) => c.schemaName,
        );

      return Object.assign(schemasMap, schemas);
    },
    addSchema: (schema: string | DatabaseSchemaSchemaComponent) =>
      base.addComponent(
        typeof schema === 'string'
          ? databaseSchemaSchemaComponent({ schemaName: schema })
          : schema,
      ),
  };
};
