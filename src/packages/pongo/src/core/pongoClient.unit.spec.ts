import assert from 'node:assert';
import type { DatabaseDriverType } from '@event-driven-io/dumbo';
import { describe, it } from 'vitest';
import type { PongoDatabaseFactoryOptions, PongoDriver } from './drivers';
import { pongoClient } from './pongoClient';
import type { PongoDb } from './typing';

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
