import {
  databaseComponent,
  isDefaultDatabaseSchema,
  type AnyDatabaseComponent,
  type SchemaComponentMigrator,
} from '@event-driven-io/dumbo';
import {
  isPongoCollectionComponent,
  pongoSchema,
  type PongoCollectionComponent,
} from '../schema';
import { PongoError } from '../errors';
import type {
  AnyPongoDb,
  PongoCollection,
  PongoDBCollectionOptions,
  PongoDocument,
} from '../typing';

type PongoDatabaseComponentOptions = Readonly<{
  component?: AnyDatabaseComponent | undefined;
  defaultSchemaName: string;
  createMigrator: (
    component: AnyDatabaseComponent,
  ) => SchemaComponentMigrator<AnyDatabaseComponent>;
  createCollection: <
    Document extends PongoDocument,
    Payload extends PongoDocument = Document,
  >(
    component: PongoCollectionComponent<Document>,
    options?: PongoDBCollectionOptions<Document, Payload>,
  ) => PongoCollection<Document>;
}>;

const databaseSchemaLabel = (databaseSchemaName: string): string =>
  isDefaultDatabaseSchema(databaseSchemaName)
    ? 'the default database schema'
    : `database schema "${databaseSchemaName}"`;

export const PongoDatabaseComponent = ({
  component: initialComponent,
  defaultSchemaName,
  createMigrator,
  createCollection,
}: PongoDatabaseComponentOptions) => {
  let migrator = createMigrator(
    initialComponent === undefined
      ? databaseComponent({ defaultSchemaName })
      : initialComponent.withDefaultSchemaName(defaultSchemaName),
  );
  const replaceComponent = (component: AnyDatabaseComponent) => {
    migrator = createMigrator(component);
  };

  const collectionsBySchema = new Map<
    string,
    Map<string, PongoCollection<PongoDocument>>
  >([[defaultSchemaName, new Map()]]);
  const collectionsIn = (databaseSchemaName: string) => {
    let collections = collectionsBySchema.get(databaseSchemaName);
    if (collections === undefined) {
      collections = new Map();
      collectionsBySchema.set(databaseSchemaName, collections);
    }
    return collections;
  };
  const collections = () =>
    [...collectionsBySchema.values()].flatMap((schemaCollections) => [
      ...schemaCollections.values(),
    ]);

  const collectionComponent = <Document extends PongoDocument>(
    collectionName: string,
    requestedSchemaName?: string,
    definition?: PongoCollectionComponent<Document>,
  ) => {
    const databaseSchemaName = requestedSchemaName ?? defaultSchemaName;
    const declared = migrator.component.findTable({
      tableName: collectionName,
      databaseSchemaName,
    });

    if (declared !== undefined) {
      if (!isPongoCollectionComponent(declared)) {
        throw new PongoError(
          `Table "${collectionName}" in ${databaseSchemaLabel(databaseSchemaName)} is not a Pongo collection`,
        );
      }
      return declared as PongoCollectionComponent<Document>;
    }

    const aliased =
      migrator.component.findSchema(databaseSchemaName)?.tables[collectionName];
    if (aliased !== undefined) {
      throw new PongoError(
        `Cannot add collection "${collectionName}" to ${databaseSchemaLabel(databaseSchemaName)} because that alias already refers to table "${aliased.tableName}"`,
      );
    }

    const created =
      definition?.withTableName(collectionName) ??
      pongoSchema.collection<Document>(collectionName);
    replaceComponent(
      migrator.component.withTable(
        { [collectionName]: created },
        databaseSchemaName,
      ),
    );

    return migrator.component.findTable({
      tableName: collectionName,
      databaseSchemaName,
    }) as PongoCollectionComponent<Document>;
  };

  const renameCollection = <Document extends PongoDocument>(
    collection: PongoCollectionComponent<Document>,
    newCollectionName: string,
  ): PongoCollectionComponent<Document> => {
    const { databaseSchemaName } = collection.fullName;

    replaceComponent(
      migrator.component.withTable(
        { [newCollectionName]: collection.rename(newCollectionName) },
        databaseSchemaName,
      ),
    );

    return migrator.component.findTable({
      tableName: newCollectionName,
      databaseSchemaName,
    }) as PongoCollectionComponent<Document>;
  };

  const collection = <
    Document extends PongoDocument,
    Payload extends PongoDocument = Document,
  >(
    collectionName: string,
    options?: PongoDBCollectionOptions<Document, Payload>,
  ): PongoCollection<Document> => {
    const resolved = collectionComponent<Document>(
      collectionName,
      options?.databaseSchemaName,
      options?.definition,
    );
    const schemaCollections = collectionsIn(
      resolved.fullName.databaseSchemaName,
    );
    const hasRuntimeOptions =
      options?.cache !== undefined ||
      options?.errors !== undefined ||
      options?.schema !== undefined;
    const existing = schemaCollections.get(collectionName) as
      PongoCollection<Document> | undefined;

    if (existing !== undefined && existing.collectionName !== collectionName) {
      schemaCollections.delete(collectionName);
      schemaCollections.set(
        existing.collectionName,
        existing as PongoCollection<PongoDocument>,
      );
    } else if (!hasRuntimeOptions && existing !== undefined) return existing;

    const created = createCollection<Document, Payload>(resolved, options);

    if (!hasRuntimeOptions) {
      schemaCollections.set(
        collectionName,
        created as PongoCollection<PongoDocument>,
      );
    }
    return created;
  };

  const schemaViews = new Map<
    string,
    Readonly<Record<string, PongoCollection<PongoDocument>>>
  >();
  const schemaView = (schemaName: string) => {
    const existing = schemaViews.get(schemaName);
    if (existing !== undefined) return existing;

    const view = new Proxy(
      Object.create(null) as Readonly<
        Record<string, PongoCollection<PongoDocument>>
      >,
      {
        get: (_target, property) => {
          if (typeof property !== 'string') return undefined;

          const schema = migrator.component.schemas[schemaName];
          if (schema === undefined) return undefined;

          const table = schema.tables[property];
          if (!isPongoCollectionComponent(table)) return undefined;

          return collection(table.tableName, {
            databaseSchemaName: schema.schemaName,
          });
        },
      },
    );
    schemaViews.set(schemaName, view);
    return view;
  };

  return {
    get component() {
      return migrator.component;
    },
    get migrations() {
      return migrator.component.migrations();
    },
    get migrator() {
      return migrator;
    },
    collection,
    collections,
    renameCollection,
    expose: <Database extends AnyPongoDb>(database: Database): Database =>
      new Proxy(database, {
        get: (target, property) => {
          if (property in target) {
            return target[property as keyof Database];
          }
          if (typeof property !== 'string') return undefined;

          const table = migrator.component.tables[property];
          if (isPongoCollectionComponent(table)) {
            return collection(table.tableName);
          }

          const schema = migrator.component.schemas[property];
          if (
            schema === undefined ||
            !Object.values(schema.tables).some(isPongoCollectionComponent)
          ) {
            return undefined;
          }

          return schemaView(property);
        },
      }),
  };
};
