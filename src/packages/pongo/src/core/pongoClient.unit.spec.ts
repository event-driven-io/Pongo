import assert from 'node:assert';
import { dumboSchema, type DatabaseDriverType } from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import type { PongoDatabaseFactoryOptions, PongoDriver } from './drivers';
import { pongoClient } from './pongoClient';
import { pongoSchema } from './schema';
import { pongoCollectionsSchema } from './database';
import type { PongoCollection, PongoDb, PongoDocument } from './typing';

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

  it('projects typed Pongo features from a database schema', () => {
    type User = PongoDocument & { email: string };
    const { driver, databaseFactoryCalls } = testPongoDriver();
    const feature = pongoCollectionsSchema(
      'app',
      pongoSchema.db('app', {
        users: pongoSchema.collection<User>('users'),
      }),
      {
        driverType: TestDriverType,
        collectionFactory: (schema) =>
          ({
            schemaComponentKey: schema.databaseSchema
              ? `sc:pongo:collection:${schema.databaseSchema}:${schema.name}`
              : `sc:pongo:collection:${schema.name}`,
            migrations: [],
            components: new Map(),
            collectionName: schema.name,
            definition: schema,
            sqlBuilder: {},
          }) as never,
      },
    );
    const schema = dumboSchema.database(
      'app',
      {},
      {
        components: [feature],
      },
    );

    const client = pongoClient({
      driver,
      schema: { definition: schema },
    });

    client.db('app');
    const definition = databaseFactoryCalls[0]?.schema?.definition as
      { collections: Record<string, unknown> } | undefined;

    assert.deepStrictEqual(Object.keys(definition?.collections ?? {}), [
      'users',
    ]);
    expectTypeOf(client.db('app')).toMatchTypeOf<PongoDb<TestDriverType>>();
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
