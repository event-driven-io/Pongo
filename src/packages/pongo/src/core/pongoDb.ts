import {
  dumbo,
  fromConnectorType,
  runSQLMigrations,
  schemaComponent,
  SQL,
  type ConnectorType,
  type DatabaseConnectionString,
  type DumboConnectionOptions,
  type InferConnectorDatabaseType,
  type QueryResult,
  type QueryResultRow,
  type SchemaComponent,
} from '@event-driven-io/dumbo';
import { getDatabaseNameOrDefault } from '@event-driven-io/dumbo/pg';
import { PongoCollectionSchemaComponent } from '../storage/all';
import {
  pongoCollection,
  transactionExecutorOrDefault,
  type PongoCollectionSchemaComponentOptions,
} from './collection';
import type { PongoClientOptions } from './pongoClient';
import { proxyPongoDbWithSchema } from './schema';
import {
  objectEntries,
  type CollectionOperationOptions,
  type Document,
  type PongoCollection,
  type PongoDb,
} from './typing';

export type PongoDbClientOptions<
  ConnectionString extends DatabaseConnectionString<
    InferConnectorDatabaseType<Connector>
  >,
  Connector extends ConnectorType = ConnectorType,
> = {
  connector: Connector;
  dbName: string | undefined;
} & PongoClientOptions<ConnectionString, Connector>;

export const getPongoDb = <
  ConnectionString extends DatabaseConnectionString<
    InferConnectorDatabaseType<Connector>
  >,
  Connector extends ConnectorType = ConnectorType,
  DbClientOptions extends PongoDbClientOptions<
    ConnectionString,
    Connector
  > = PongoDbClientOptions<ConnectionString, Connector>,
>(
  options: DbClientOptions,
): PongoDb => {
  const { connectionString, dbName, connector } = options;
  const databaseName = dbName ?? getDatabaseNameOrDefault(connectionString);

  const pool = dumbo<
    DumboConnectionOptions<Connector, ConnectionString>,
    Connector
  >({
    connector,
    connectionString,
    ...(options.connectionOptions ?? {}),
  });

  const collections = new Map<string, PongoCollection<Document>>();

  const command = async <Result extends QueryResultRow = QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions,
  ) =>
    (
      await transactionExecutorOrDefault(db, options, pool.execute)
    ).command<Result>(sql);

  const query = async <T extends QueryResultRow>(
    sql: SQL,
    options?: CollectionOperationOptions,
  ) =>
    (await transactionExecutorOrDefault(db, options, pool.execute)).query<T>(
      sql,
    );

  const databaseType = fromConnectorType(pool.connector).databaseType;

  const db: PongoDb<Connector> = {
    connector: options.connector,
    databaseName,
    connect: () => Promise.resolve(),
    close: () => pool.close(),

    collections: () => [...collections.values()],
    collection: (collectionName) =>
      pongoCollection({
        collectionName,
        db,
        pool,
        schemaComponent: PongoCollectionSchemaComponent({
          collectionName,
          connector,
        }),
        schema: options.schema ? options.schema : {},
        errors: options.errors ? options.errors : {},
      }),
    transaction: () => pool.transaction(),
    withTransaction: (handle) => pool.withTransaction(handle),

    schema: {
      get component(): SchemaComponent {
        return schemaComponent('pongoDb', {
          components: [...collections.values()].map((c) => c.schema.component),
        });
      },
      migrate: async () =>
        runSQLMigrations(
          pool,
          await PongoDatabaseSchemaComponent(
            connector,
            [...collections.values()].map((c) => c.schema.component),
          ).resolveMigrations({
            databaseType,
          }),
        ),
    },

    sql: {
      async query<Result extends QueryResultRow = QueryResultRow>(
        sql: SQL,
        options?: CollectionOperationOptions,
      ): Promise<Result[]> {
        const result = await query<Result>(sql, options);
        return result.rows;
      },
      async command<Result extends QueryResultRow = QueryResultRow>(
        sql: SQL,
        options?: CollectionOperationOptions,
      ): Promise<QueryResult<Result>> {
        return command(sql, options);
      },
    },
  };

  const dbsSchema = options?.schema?.definition?.dbs;

  if (dbsSchema) {
    const dbSchema = objectEntries(dbsSchema)
      .map((e) => e[1])
      .find((db) => db.name === dbName || db.name === databaseName);

    if (dbSchema) return proxyPongoDbWithSchema(db, dbSchema, collections);
  }

  return db;
};

export type PongoDatabaseSchemaComponent =
  SchemaComponent<'pongo:schema-component:database'> & {
    collections: ReadonlyArray<PongoCollectionSchemaComponent>;

    addCollection: (
      options: PongoCollectionSchemaComponentOptions,
    ) => PongoCollectionSchemaComponent;
  };

export const PongoDatabaseSchemaComponent = (
  _connector: ConnectorType,
  existingCollections: PongoCollectionSchemaComponent[],
): PongoDatabaseSchemaComponent => {
  const collections = [...existingCollections];

  return {
    ...schemaComponent('pongo:schema-component:database', {
      components: collections,
    }),
    collections,

    addCollection: (options: PongoCollectionSchemaComponentOptions) => {
      const newCollection = PongoCollectionSchemaComponent(options);
      collections.push(newCollection);
      return newCollection;
    },
  };
};
