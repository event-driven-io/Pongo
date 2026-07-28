import {
  databaseComponent,
  databaseSchemaComponent,
  editMaterializedDatabase,
  findComponents,
  materializeSchemaComponent,
  type AnySchemaComponent,
  type AnyDatabaseSchemaComponent,
  type ComponentContext,
  type DatabaseComponent,
  type DatabaseDriverType,
  type SchemaMaterializationOptions,
} from '@event-driven-io/dumbo';
import type { PongoCollectionSQLBuilder } from '../collection';
import {
  isPongoCollectionComponent,
  isPongoDatabaseComponent,
  pongoDatabaseComponentType,
  pongoSchema,
  type PongoCollectionComponent,
  type PongoDatabaseComponent,
  type PongoSchemaComponent,
} from '../schema';
import type { PongoDocument } from '../typing';

export type PongoRuntimeCollectionComponent<
  Document extends PongoDocument = PongoDocument,
> = PongoCollectionComponent<Document> &
  Readonly<{
    collectionName: string;
    sqlBuilder: PongoCollectionSQLBuilder;
  }>;

type RuntimeEditor = ReturnType<typeof editMaterializedDatabase>;

export type PongoRuntimeDatabaseComponent<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Definition extends PongoDatabaseComponent = PongoDatabaseComponent,
> = DatabaseComponent<Readonly<Record<string, PongoSchemaComponent>>, string> &
  Readonly<{
    [pongoDatabaseComponentType]: true;
    driverType: DriverType;
    definition: Definition;
    collections: ReadonlyArray<PongoRuntimeCollectionComponent>;
    editor: RuntimeEditor;
    collection: <Document extends PongoDocument = PongoDocument>(
      declaration: PongoCollectionComponent<Document>,
      schemaName: string,
    ) => PongoRuntimeCollectionComponent<Document>;
  }>;

export type MaterializePongoDatabaseOptions<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
  Definition extends PongoDatabaseComponent = PongoDatabaseComponent,
> = Readonly<{
  driverType: DriverType;
  databaseName: string;
  defaultSchemaName: string;
  definition?: Definition | undefined;
  sqlBuilderFor: (
    collection: PongoCollectionComponent,
    context: ComponentContext,
  ) => PongoCollectionSQLBuilder;
  migrationsFor?: SchemaMaterializationOptions['migrationsFor'];
}>;

const define = (target: object, key: PropertyKey, value: unknown): void => {
  Object.defineProperty(target, key, {
    value,
    enumerable: typeof key === 'string',
    configurable: false,
    writable: false,
  });
};

const sourceDatabase = (
  definition: PongoDatabaseComponent,
  defaultSchemaName: string,
): DatabaseComponent => {
  if (!('collections' in definition)) return definition;

  const schema = pongoSchema.schema(definition.collections);
  const source = databaseComponent({
    databaseName: definition.databaseName,
    schemas: { [defaultSchemaName]: schema },
    extensions: definition.extensions,
  });
  define(source, pongoDatabaseComponentType, true);
  return source;
};

export const materializePongoDatabaseComponent = <
  DriverType extends DatabaseDriverType,
  Definition extends PongoDatabaseComponent = PongoDatabaseComponent,
>(
  options: MaterializePongoDatabaseOptions<DriverType, Definition>,
): PongoRuntimeDatabaseComponent<DriverType, Definition> => {
  const definition =
    options.definition ?? (pongoSchema.db({ collections: {} }) as Definition);
  const materialization = {
    context: { databaseName: options.databaseName },
    migrationsFor: options.migrationsFor,
  } satisfies SchemaMaterializationOptions;
  const database = materializeSchemaComponent(
    sourceDatabase(definition, options.defaultSchemaName),
    materialization,
  );
  const editor = editMaterializedDatabase(database, materialization);

  const decorate = <Document extends PongoDocument>(
    collection: PongoCollectionComponent<Document>,
  ): PongoRuntimeCollectionComponent<Document> => {
    if (!('collectionName' in collection)) {
      const context = {
        databaseName: options.databaseName,
        databaseSchemaName: collection.databaseSchemaName,
        tableName: collection.tableName,
      };
      define(collection, 'collectionName', collection.tableName);
      define(
        collection,
        'sqlBuilder',
        options.sqlBuilderFor(collection, context),
      );
    }
    return collection as PongoRuntimeCollectionComponent<Document>;
  };

  for (const collection of findComponents(
    database,
    isPongoCollectionComponent,
  )) {
    decorate(collection);
  }

  const runtimeEditor = {
    ...editor,
    setTable: (
      schemaName: string,
      alias: string,
      declaration: Parameters<RuntimeEditor['setTable']>[2],
    ) => {
      const table = editor.setTable(schemaName, alias, declaration);
      return isPongoCollectionComponent(table) ? decorate(table) : table;
    },
  };

  const collection = <Document extends PongoDocument>(
    declaration: PongoCollectionComponent<Document>,
    schemaName: string,
  ): PongoRuntimeCollectionComponent<Document> => {
    let schema: AnyDatabaseSchemaComponent | undefined =
      database.schemas[schemaName];
    if (schema === undefined) {
      schema = editor.addSchema(
        schemaName,
        databaseSchemaComponent({ schemaName }),
      );
    }
    const existing = Object.values(schema.tables).find(
      (table) =>
        isPongoCollectionComponent(table) &&
        table.tableName === declaration.tableName,
    );
    if (existing !== undefined && isPongoCollectionComponent(existing)) {
      return decorate(existing as PongoCollectionComponent<Document>);
    }
    return decorate(
      editor.setTable(
        schemaName,
        declaration.tableName,
        declaration,
      ) as PongoCollectionComponent<Document>,
    );
  };

  define(database, 'driverType', options.driverType);
  define(database, 'definition', definition);
  define(database, 'editor', runtimeEditor);
  define(database, 'collection', collection);
  Object.defineProperty(database, 'collections', {
    get: () =>
      findComponents(database, isPongoCollectionComponent).map(decorate),
    enumerable: true,
  });

  return database as PongoRuntimeDatabaseComponent<DriverType, Definition>;
};

export const findPongoDatabaseComponent = (
  root: AnySchemaComponent,
  databaseName: string,
): PongoRuntimeDatabaseComponent => {
  const database = findComponents(
    root,
    (component): component is PongoRuntimeDatabaseComponent =>
      isPongoDatabaseComponent(component) &&
      'driverType' in component &&
      component.databaseName === databaseName,
  )[0];

  if (database === undefined) {
    throw new Error(
      `Pongo database component not found for database: ${databaseName}`,
    );
  }
  return database;
};

export type PongoDatabaseSQLBuilder<
  DriverType extends DatabaseDriverType = DatabaseDriverType,
> = {
  driverType: DriverType;
  collection: PongoCollectionSQLBuilder;
};
