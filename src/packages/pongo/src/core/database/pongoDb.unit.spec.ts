import assert from 'node:assert';
import {
  JSONSerializer,
  type AnyConnection,
  type ConnectionPool,
  type DatabaseTransactionOptions,
  type OperationContext,
} from '@event-driven-io/dumbo';
import { describe, it } from 'vitest';
import { pongoSchema } from '../schema';
import { PongoDatabase } from './pongoDb';
import { PongoDatabaseSchemaComponent } from './pongoDatabaseSchemaComponent';

const createTestDb = (options?: { allowNestedTransactions?: boolean }) => {
  let transactionOptions: DatabaseTransactionOptions | undefined;
  let withTransactionOptions: DatabaseTransactionOptions | undefined;
  const operationContext: OperationContext = {
    signal: new AbortController().signal,
  };

  const pool = {
    driverType: 'test:test',
    close: () => Promise.resolve(),
    connection: () => Promise.resolve({} as AnyConnection),
    withConnection: () => Promise.resolve(undefined),
    execute: {
      query: () => Promise.resolve({ rows: [] }),
      batchQuery: () => Promise.resolve([]),
      command: () => Promise.resolve({ rows: [], changes: 0 }),
      batchCommand: () => Promise.resolve([]),
    },
    transaction: (options?: DatabaseTransactionOptions) => {
      transactionOptions = options;
      return {} as ReturnType<ConnectionPool['transaction']>;
    },
    withTransaction: async (
      handle: Parameters<ConnectionPool['withTransaction']>[0],
      options?: DatabaseTransactionOptions,
    ) => {
      withTransactionOptions = options;
      return handle(
        { execute: pool.execute } as ReturnType<ConnectionPool['transaction']>,
        operationContext,
      );
    },
  } as unknown as ConnectionPool;

  const db = PongoDatabase({
    databaseName: 'test',
    pool,
    serializer: JSONSerializer,
    transactionOptions: options,
    schemaComponent: PongoDatabaseSchemaComponent({
      driverType: 'test:test',
      definition: pongoSchema.db('test', {}),
      collectionFactory: (schema) =>
        ({
          schemaComponentKey: `sc:pongo:collection:${schema.name}`,
          migrations: [],
          nested: [],
        }) as never,
    }),
  });

  return {
    db,
    transactionOptions: () => transactionOptions,
    withTransactionOptions: () => withTransactionOptions,
  };
};

describe('PongoDatabase transactions', () => {
  it('starts transactions with nested transactions enabled while preserving savepoints', () => {
    const { db, transactionOptions } = createTestDb();

    db.transaction({
      useSavepoints: true,
    });

    assert.deepStrictEqual(transactionOptions(), {
      allowNestedTransactions: true,
      useSavepoints: true,
    });
  });

  it('runs withTransaction with nested transactions enabled while preserving savepoints', async () => {
    const { db, withTransactionOptions } = createTestDb();

    await db.withTransaction(() => Promise.resolve(undefined), {
      useSavepoints: true,
    });

    assert.deepStrictEqual(withTransactionOptions(), {
      allowNestedTransactions: true,
      useSavepoints: true,
    });
  });

  it('respects explicitly disabled nested transactions', async () => {
    const { db, transactionOptions, withTransactionOptions } = createTestDb();

    db.transaction({
      allowNestedTransactions: false,
      useSavepoints: true,
    });

    await db.withTransaction(() => Promise.resolve(undefined), {
      allowNestedTransactions: false,
      useSavepoints: true,
    });

    assert.deepStrictEqual(transactionOptions(), {
      allowNestedTransactions: false,
      useSavepoints: true,
    });
    assert.deepStrictEqual(withTransactionOptions(), {
      allowNestedTransactions: false,
      useSavepoints: true,
    });
  });

  it('respects explicitly disabled nested transactions from database options', async () => {
    const { db, transactionOptions, withTransactionOptions } = createTestDb({
      allowNestedTransactions: false,
    });

    db.transaction();
    await db.withTransaction(() => Promise.resolve(undefined));

    assert.deepStrictEqual(transactionOptions(), {
      allowNestedTransactions: false,
    });
    assert.deepStrictEqual(withTransactionOptions(), {
      allowNestedTransactions: false,
    });
  });
});
