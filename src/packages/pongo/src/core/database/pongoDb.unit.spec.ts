import assert from 'node:assert';
import {
  JSONSerializer,
  SQL,
  sqlMigration,
  type AnyConnection,
  type Abort,
  type ConnectionPool,
  type DatabaseTransactionOptions,
} from '@event-driven-io/dumbo';
import { describe, it } from 'vitest';
import type { PongoCollectionSQLBuilder } from '../collection';
import { isPongoCollectionComponent, pongoSchema } from '../schema';
import { PongoDatabase } from './pongoDb';
import { materializePongoDatabaseComponent } from './pongoDatabaseSchemaComponent';

const emptySQL = () => SQL``;
const stubSQLBuilder: PongoCollectionSQLBuilder = {
  createCollection: emptySQL,
  insertOne: emptySQL,
  insertMany: emptySQL,
  insertOrReplace: emptySQL,
  updateOne: emptySQL,
  replaceOne: emptySQL,
  updateMany: emptySQL,
  deleteOne: emptySQL,
  deleteMany: emptySQL,
  replaceMany: emptySQL,
  deleteManyByIds: emptySQL,
  findOne: emptySQL,
  find: emptySQL,
  countDocuments: emptySQL,
  rename: emptySQL,
  drop: emptySQL,
};

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
    defaultSchemaName: 'public',
    transactionOptions: options,
    schemaComponent: materializePongoDatabaseComponent({
      driverType: 'test:test',
      databaseName: 'test',
      defaultSchemaName: 'public',
      definition: pongoSchema.db('test', { collections: {} }),
      sqlBuilderFor: () => stubSQLBuilder,
      migrationsFor: (component, context) =>
        isPongoCollectionComponent(component)
          ? [
              sqlMigration(
                `${context.databaseSchemaName}.${component.tableName}:table`,
                [SQL`SELECT 1`],
              ),
            ]
          : [],
    }),
  });

  return {
    db,
    transactionOptions: () => transactionOptions,
    withTransactionOptions: () => withTransactionOptions,
  };
};

describe('PongoDatabase transactions', () => {
  it('accepts database schema and document schema settings together', () => {
    const { db } = createTestDb();

    const collection = db.collection<
      { _id: string; displayName: string },
      { _id: string; name: string }
    >('users', {
      schemaName: 'crm',
      schema: {
        versioning: {
          upcast: (stored) => ({
            _id: stored._id,
            displayName: stored.name,
          }),
          downcast: (document) => ({
            _id: document._id,
            name: document.displayName,
          }),
        },
      },
    });

    assert.strictEqual(collection.schema.component.databaseSchemaName, 'crm');
  });

  it('uses the default schema when the callable schema accessor has no name', () => {
    const { db } = createTestDb();

    const scoped = db.schema().collection('users');
    const direct = db.collection('users');

    assert.strictEqual(scoped, direct);
    assert.strictEqual(scoped.schema.component.databaseSchemaName, 'public');
  });

  it('returns the same schema scope for repeated access', () => {
    const { db } = createTestDb();

    assert.strictEqual(db.schema(), db.schema());
    assert.strictEqual(db.schema('audit'), db.schema('audit'));
    assert.notStrictEqual(db.schema(), db.schema('audit'));
  });

  it('keeps schema metadata live while collections are registered', () => {
    const { db } = createTestDb();
    const component = db.schema.component;
    const definition = db.schema.definition;

    assert.deepStrictEqual(db.schema.migrations, []);

    const scoped = db.schema('audit').collection('entries');
    const direct = db.collection('entries', { schemaName: 'audit' });

    assert.strictEqual(scoped, direct);
    assert.strictEqual(db.schema.component, component);
    assert.strictEqual(db.schema.definition, definition);
    assert.deepStrictEqual(
      scoped.schema.component.migrations.map((migration) => migration.name),
      ['audit.entries:table'],
    );
    assert.deepStrictEqual(
      db.schema.migrations,
      scoped.schema.component.migrations,
    );
    assert.strictEqual(
      component.schemas.audit?.tables.entries,
      scoped.schema.component,
    );
  });

  it('creates schema-qualified collection components lazily', () => {
    const { db } = createTestDb();

    const collection = db.collection('users', { schemaName: 'crm' });

    assert.strictEqual(collection.collectionName, 'users');
    assert.strictEqual(collection.schema.component.databaseSchemaName, 'crm');
    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.users !== undefined,
      true,
    );
  });

  it('keeps default and schema-qualified collections distinct', () => {
    const { db } = createTestDb();

    const defaultUsers = db.collection('users');
    const explicitDefaultUsers = db.collection('users', {
      schemaName: 'public',
    });
    const crmUsers = db.collection('users', { schemaName: 'crm' });

    assert.strictEqual(defaultUsers, explicitDefaultUsers);
    assert.notStrictEqual(defaultUsers, crmUsers);
    assert.strictEqual(db.collections().length, 2);
    assert.strictEqual(
      defaultUsers.schema.component.databaseSchemaName,
      'public',
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
