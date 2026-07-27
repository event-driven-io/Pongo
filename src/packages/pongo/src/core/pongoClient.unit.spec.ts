import assert from 'node:assert';
import { dumboSchema, type DatabaseDriverType } from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import type { PongoDatabaseFactoryOptions, PongoDriver } from './drivers';
import { pongoClient } from './pongoClient';
import { pongoSchema, proxyPongoDbWithSchema } from './schema';
import {
  pongoClientSchemaFromDumboComponent,
  pongoCollectionsSchema,
} from './database';
import { PongoCollectionSchemaComponent } from './collection';
import type {
  PongoCollection,
  PongoDBCollectionOptions,
  PongoDb,
  PongoDocument,
} from './typing';

type TestDriverType = DatabaseDriverType<'Test'>;
const TestDriverType: TestDriverType = 'Test:fake';

const testPongoDb = (options: {
  databaseName: string;
  onConnect: (databaseName: string) => void;
  onClose: (databaseName: string) => void;
}): PongoDb<TestDriverType> => ({
  driverType: TestDriverType,
  databaseName: options.databaseName,
  connect: () => {
    options.onConnect(options.databaseName);
    return Promise.resolve();
  },
  close: () => {
    options.onClose(options.databaseName);
    return Promise.resolve();
  },
  collection: () =>
    ({
      close: () => Promise.resolve(),
    }) as never,
  collections: () => [],
  transaction: () => ({}) as never,
  withTransaction: () => Promise.resolve(undefined as never),
  schema: {
    component: {} as never,
    migrate: () => Promise.resolve({ applied: [], skipped: [] }),
  },
  sql: {
    query: () => Promise.resolve([]),
    command: () => Promise.resolve({ rows: [], rowCount: 0, changes: 0 }),
  },
});

type TestPongoDriverOptions = {
  connectionString?: string;
  connectionOptions?: {
    connection?: { id: string };
    transactionOptions?: {
      allowNestedTransactions?: boolean;
      useSavepoints?: boolean;
    };
  };
};

const testPongoDriver = () => {
  const databaseFactoryCalls: PongoDatabaseFactoryOptions[] = [];
  const connected: string[] = [];
  const closed: string[] = [];

  const driver = {
    driverType: TestDriverType,
    databaseFactory: (options) => {
      databaseFactoryCalls.push(options);

      return testPongoDb({
        databaseName: options.databaseName ?? 'db:default',
        onConnect: (databaseName) => connected.push(databaseName),
        onClose: (databaseName) => closed.push(databaseName),
      });
    },
  } satisfies PongoDriver<PongoDb<TestDriverType>, TestPongoDriverOptions>;

  return {
    driver,
    databaseFactoryCalls,
    connected,
    closed,
  };
};

describe('pongoClient', () => {
  it('keeps typed client schema access', () => {
    type User = PongoDocument & { email: string };
    const { driver } = testPongoDriver();
    const schema = pongoSchema.client({
      app: pongoSchema.db('app', {
        users: pongoSchema.collection<User>('users'),
      }),
    });

    const _client = pongoClient({
      driver,
      schema: { definition: schema },
    });

    type Client = typeof _client;

    expectTypeOf<Client['app']['users']>().toEqualTypeOf<
      PongoCollection<User>
    >();
  });

  it('keeps typed database and schema access', () => {
    type User = PongoDocument & { email: string };
    type Audit = PongoDocument & { reason: string };
    const { driver } = testPongoDriver();
    const schema = pongoSchema.database('app', {
      crm: pongoSchema.schema('crm', {
        users: pongoSchema.collection<User>('users'),
      }),
      audit: pongoSchema.schema('audit', {
        entries: pongoSchema.collection<Audit>('entries'),
      }),
    });

    const _client = pongoClient({
      driver,
      schema: { definition: schema },
    });

    type Client = typeof _client;

    expectTypeOf<Client['app']['crm']['users']>().toEqualTypeOf<
      PongoCollection<User>
    >();
    expectTypeOf<Client['app']['audit']['entries']>().toEqualTypeOf<
      PongoCollection<Audit>
    >();
  });

  it('projects database schema collections with their schema names', () => {
    type User = PongoDocument & { email: string };
    const collectionCalls: { name: string; schema?: string | undefined }[] = [];
    const db = {
      ...testPongoDb({
        databaseName: 'app',
        onConnect: () => undefined,
        onClose: () => undefined,
      }),
      collection: <T extends PongoDocument, Payload extends PongoDocument = T>(
        name: string,
        options?: PongoDBCollectionOptions<T, Payload>,
      ) => {
        const schema =
          typeof options?.schema === 'string' ? options.schema : undefined;

        collectionCalls.push({ name, schema });
        return { name, schema } as never;
      },
    };
    const schema = pongoSchema.database('app', {
      crm: pongoSchema.schema('crm', {
        users: pongoSchema.collection<User>('users'),
      }),
    });
    const collections = new Map<string, PongoCollection<PongoDocument>>();
    const projected = proxyPongoDbWithSchema(db, schema, collections);

    assert.deepStrictEqual(projected.crm.users, {
      name: 'users',
      schema: 'crm',
    });
    assert.deepStrictEqual(collectionCalls, [
      { name: 'users', schema: 'crm' },
      { name: 'users', schema: 'crm' },
    ]);
    type Projected = typeof projected;

    expectTypeOf<Projected['crm']['users']>().toEqualTypeOf<
      PongoCollection<User>
    >();
  });

  it('keeps duplicate schema-group collection aliases scoped at runtime', () => {
    type User = PongoDocument & { email: string };
    const db = {
      ...testPongoDb({
        databaseName: 'app',
        onConnect: () => undefined,
        onClose: () => undefined,
      }),
      collection: <T extends PongoDocument, Payload extends PongoDocument = T>(
        name: string,
        options?: PongoDBCollectionOptions<T, Payload>,
      ) =>
        ({
          name,
          schema:
            typeof options?.schema === 'string' ? options.schema : undefined,
        }) as never,
    };
    const schema = pongoSchema.database('app', {
      crm: pongoSchema.schema('crm', {
        users: pongoSchema.collection<User>('users'),
      }),
      audit: pongoSchema.schema('audit', {
        users: pongoSchema.collection<User>('users'),
      }),
    });
    const collections = new Map<string, PongoCollection<PongoDocument>>();
    const projected = proxyPongoDbWithSchema(db, schema, collections);

    assert.deepStrictEqual(Object.keys(schema.collections), []);
    assert.strictEqual(projected.users, undefined);
    assert.deepStrictEqual(projected.crm.users, {
      name: 'users',
      schema: 'crm',
    });
    assert.deepStrictEqual(projected.audit.users, {
      name: 'users',
      schema: 'audit',
    });
  });

  it('projects typed Pongo features from a database schema component tree', () => {
    type User = PongoDocument & { email: string };
    const feature = pongoCollectionsSchema(
      'app',
      pongoSchema.db('app', {
        users: pongoSchema.collection<User>('users'),
      }),
      {
        driverType: TestDriverType,
        collectionFactory: (schema) =>
          PongoCollectionSchemaComponent({
            driverType: TestDriverType,
            definition: schema,
            sqlBuilder: {} as never,
          }),
      },
    );
    const schema = dumboSchema.database(
      'app',
      {},
      {
        components: [feature],
      },
    );

    const definition = pongoClientSchemaFromDumboComponent(schema)?.dbs.app;

    assert.deepStrictEqual(Object.keys(definition?.collections ?? {}), [
      'users',
    ]);
  });

  it('forwards connection options to the driver database factory', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const connection = { id: 'connection' };

    const client = pongoClient({
      driver,
      connectionString: 'test://connection',
      connectionOptions: {
        connection,
        transactionOptions: {
          allowNestedTransactions: false,
          useSavepoints: true,
        },
      },
    });

    client.db('custom-db');

    assert.deepStrictEqual(databaseFactoryCalls[0], {
      connectionString: 'test://connection',
      connectionOptions: {
        connection,
        transactionOptions: {
          allowNestedTransactions: false,
          useSavepoints: true,
        },
      },
      databaseName: 'custom-db',
      schema: {},
      serializer: databaseFactoryCalls[0]?.serializer,
      errors: undefined,
      cache: 'disabled',
      serialization: undefined,
    });
  });

  it('reuses databases by database name', () => {
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const client = pongoClient({ driver });

    const first = client.db('same-db');
    const second = client.db('same-db');

    assert.strictEqual(first, second);
    assert.strictEqual(databaseFactoryCalls.length, 1);
  });

  it('connects and closes created databases', async () => {
    const { driver, connected, closed } = testPongoDriver();
    const client = pongoClient({ driver });

    client.db('first-db');
    client.db('second-db');

    await client.connect();
    await client.close();

    assert.deepStrictEqual(connected.sort(), ['first-db', 'second-db']);
    assert.deepStrictEqual(closed.sort(), ['first-db', 'second-db']);
  });

  it('rolls back active implicit sessions after withSession', async () => {
    const { driver } = testPongoDriver();
    const client = pongoClient({ driver });

    let transactionActiveDuringCallback = false;

    await client.withSession((session) => {
      session.startTransaction({
        get snapshotEnabled() {
          return false;
        },
      });
      transactionActiveDuringCallback = session.inTransaction();
      return Promise.resolve();
    });

    assert.strictEqual(transactionActiveDuringCallback, true);
  });
});
