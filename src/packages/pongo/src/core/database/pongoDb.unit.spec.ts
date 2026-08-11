import assert from 'node:assert';
import {
  defaultDatabaseSchemaKey,
  JSONSerializer,
  SQL,
  SQLDefaultSchemaNameToken,
  type AnyConnection,
  type Abort,
  type ConnectionPool,
  type DatabaseTransactionOptions,
} from '@event-driven-io/dumbo';
import { describe, it } from 'vitest';
import type { PongoCollectionSQLBuilder } from '../collection';
import { pongoSchema, type PongoDbSchema } from '../schema';
import type { PongoDBCollectionOptions } from '../typing';
import { PongoDatabase } from './pongoDb';

const migrationNames = (migrations: ReadonlyArray<{ name: string }>) =>
  migrations.map(({ name }) => name);

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

const createTestDb = (options?: {
  allowNestedTransactions?: boolean;
  defaultSchemaName?: string;
  definition?: PongoDbSchema;
}) => {
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
    defaultSchemaName: options?.defaultSchemaName,
    transactionOptions: options,
    schema: {
      definition:
        options?.definition ??
        pongoSchema.db('test', {
          collections: {},
        }),
    },
    sqlBuilderFor: () => stubSQLBuilder,
  });

  return {
    db,
    transactionOptions: () => transactionOptions,
    withTransactionOptions: () => withTransactionOptions,
  };
};

describe('using a Pongo database', () => {
  it('accepts database schema and document schema settings together', () => {
    const { db } = createTestDb();

    const collection = db.collection<
      { _id: string; displayName: string },
      { _id: string; name: string }
    >('users', {
      databaseSchemaName: 'crm',
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

    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.users?.tableName,
      collection.schema.component.tableName,
    );
    assert.strictEqual(db.schema.component.schemas.crm?.schemaName, 'crm');
  });

  it('uses the default schema when the callable schema accessor has no name', () => {
    const { db } = createTestDb();

    const scoped = db.schema().collection('users');
    const direct = db.collection('users');

    assert.strictEqual(scoped, direct);
    assert.ok(
      SQLDefaultSchemaNameToken.check(
        db.schema.component.schemas[defaultDatabaseSchemaKey]?.schemaName,
      ),
    );
    assert.strictEqual(
      db.schema.component.schemas[defaultDatabaseSchemaKey]?.tables.users
        ?.tableName,
      scoped.schema.component.tableName,
    );
  });

  it('returns the same schema scope for repeated access', () => {
    const { db } = createTestDb();

    assert.strictEqual(db.schema(), db.schema());
    assert.strictEqual(db.schema('audit'), db.schema('audit'));
    assert.notStrictEqual(db.schema(), db.schema('audit'));
  });

  it('keeps schema metadata live while collections are registered', () => {
    const { db } = createTestDb();
    const initialComponent = db.schema.component;
    const definition = db.schema.definition;

    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:relational:001:create',
    ]);

    const scoped = db.schema('audit').collection('entries');
    const direct = db.collection('entries', {
      databaseSchemaName: 'audit',
    });

    assert.strictEqual(scoped, direct);
    assert.notStrictEqual(db.schema.component, initialComponent);
    assert.strictEqual(db.schema.definition, definition);
    assert.deepStrictEqual(
      scoped.schema.component.migrations().map((migration) => migration.name),
      ['table:pongo_collection:audit:entries:001:create'],
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:relational:001:create',
      'schema:relational:audit:001:create',
      'table:pongo_collection:audit:entries:001:create',
    ]);
    assert.strictEqual(
      db.schema.component.schemas.audit?.tables.entries?.tableName,
      scoped.schema.component.tableName,
    );
    assert.strictEqual(initialComponent.schemas.audit, undefined);
    assert.deepStrictEqual(
      'collections' in definition
        ? Object.keys(definition.collections)
        : Object.keys(definition.schemas),
      [],
    );
  });

  it('creates schema-qualified collection components lazily', () => {
    const { db } = createTestDb();

    const collection = db.collection('users', {
      databaseSchemaName: 'crm',
    });

    assert.strictEqual(collection.collectionName, 'users');
    assert.strictEqual(db.schema.component.schemas.crm?.schemaName, 'crm');
    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.users?.tableName,
      'users',
    );
  });

  it('keeps default and schema-qualified collections distinct', () => {
    const { db } = createTestDb();

    const defaultUsers = db.collection('users');
    const explicitDefaultUsers = db.collection('users', {
      databaseSchemaName: 'public',
    });
    const crmUsers = db.collection('users', {
      databaseSchemaName: 'crm',
    });

    assert.notStrictEqual(defaultUsers, explicitDefaultUsers);
    assert.notStrictEqual(defaultUsers, crmUsers);
    assert.strictEqual(db.collections().length, 3);
    assert.strictEqual(
      db.schema.component.schemas.public?.schemaName,
      'public',
    );
    assert.ok(
      SQLDefaultSchemaNameToken.check(
        db.schema.component.schemas[defaultDatabaseSchemaKey]?.schemaName,
      ),
    );
    assert.strictEqual(
      db.schema.component.schemas[defaultDatabaseSchemaKey]?.tables.users
        ?.tableName,
      'users',
    );
    assert.strictEqual(db.schema.component.schemas.crm?.schemaName, 'crm');
    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.users?.tableName,
      'users',
    );
  });

  it('projects a direct collection into its requested database schema', () => {
    const users = pongoSchema.collection('users', {
      databaseSchemaName: 'audit',
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        collections: { auditUsers: users },
      }),
    });
    const projected = db as typeof db & {
      auditUsers: ReturnType<typeof db.collection>;
    };

    assert.strictEqual(
      projected.auditUsers,
      db.collection('users', { databaseSchemaName: 'audit' }),
    );
    assert.strictEqual(
      db.schema.component.schemas.audit?.tables.auditUsers?.tableName,
      users.tableName,
    );
    assert.deepStrictEqual(
      Object.keys(
        db.schema.component.schemas[defaultDatabaseSchemaKey]!.tables,
      ),
      [],
    );
  });

  it('reuses a declared collection when its alias differs from its table name', () => {
    const users = pongoSchema.collection('users');
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {
            customerDirectory: users,
          }),
        },
      }),
    });
    const projected = db as typeof db & {
      crm: {
        customerDirectory: ReturnType<typeof db.collection>;
      };
    };
    const direct = db.collection('users', {
      databaseSchemaName: 'crm',
    });

    assert.strictEqual(projected.crm.customerDirectory, direct);
    assert.strictEqual(direct.schema.component.tableName, users.tableName);
    assert.strictEqual(
      db.schema.component.schemas.crm?.tables.customerDirectory?.tableName,
      users.tableName,
    );
  });

  it('rejects a collection placement conflicting with its schema scope', () => {
    const { db } = createTestDb();
    const scope = db.schema('crm') as {
      collection: (
        name: string,
        options?: PongoDBCollectionOptions<{ _id: string }>,
      ) => unknown;
    };

    assert.throws(
      () =>
        scope.collection('users', {
          databaseSchemaName: 'audit',
        }),
      /schema scope "crm".*database schema "audit"/,
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
