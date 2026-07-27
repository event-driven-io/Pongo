import assert from 'node:assert';
import {
  JSONSerializer,
  dumboSchema,
  type AnyConnection,
  type Abort,
  type ConnectionPool,
  type DatabaseTransactionOptions,
} from '@event-driven-io/dumbo';
import { describe, it } from 'vitest';
import { PongoCollectionSchemaComponent } from '../collection';
import { pongoSchema } from '../schema';
import { PongoDatabase } from './pongoDb';
import { PongoDatabaseSchemaComponent } from './pongoDatabaseSchemaComponent';

const createTestDb = (options?: { allowNestedTransactions?: boolean }) => {
  let transactionOptions: DatabaseTransactionOptions | undefined;
  let withTransactionOptions: DatabaseTransactionOptions | undefined;
  const abort: Abort = {
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
        { abort },
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
        PongoCollectionSchemaComponent({
          driverType: 'test:test',
          definition: schema,
          sqlBuilder: {} as never,
        }),
    }),
  });

  return {
    db,
    transactionOptions: () => transactionOptions,
    withTransactionOptions: () => withTransactionOptions,
  };
};

describe('PongoDatabase transactions', () => {
  it('creates schema-qualified collection components lazily', () => {
    const { db } = createTestDb();

    const collection = db.collection('users', { schema: 'crm' });

    assert.strictEqual(collection.collectionName, 'users');
    assert.strictEqual(
      collection.schema.component.schemaComponentKey,
      'sc:pongo:collection:crm:users',
    );
    assert.strictEqual(collection.schema.component.databaseSchemaName, 'crm');
    assert.strictEqual(
      db.schema.component.components.has('sc:pongo:collection:crm:users'),
      true,
    );
  });

  it('keeps default and schema-qualified collections distinct', () => {
    const { db } = createTestDb();

    const defaultUsers = db.collection('users');
    const explicitDefaultUsers = db.collection('users', {
      schema: dumboSchema.schema.defaultName,
    });
    const crmUsers = db.collection('users', { schema: 'crm' });

    assert.strictEqual(defaultUsers, explicitDefaultUsers);
    assert.notStrictEqual(defaultUsers, crmUsers);
    assert.strictEqual(db.collections().length, 2);
    assert.strictEqual(
      defaultUsers.schema.component.schemaComponentKey,
      `sc:pongo:collection:${dumboSchema.schema.defaultName}:users`,
    );
  });

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
