import assert from 'node:assert';
import {
  dumboSchema,
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

    assert.strictEqual(collection.schema.component.tableName, 'users');
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
    ]);
  });

  it('uses the default schema when the callable schema accessor has no name', () => {
    const { db } = createTestDb();

    const scoped = db.schema().collection('users');
    const direct = db.collection('users');

    assert.strictEqual(scoped, direct);
    assert.ok(
      SQLDefaultSchemaNameToken.check(
        db.schema.component.defaultSchema.schemaName,
      ),
    );
    assert.strictEqual(scoped.schema.component.tableName, 'users');
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'table:pongo_collection:users:create',
    ]);
  });

  it('returns the same schema scope for repeated access', () => {
    const { db } = createTestDb();

    assert.strictEqual(db.schema(), db.schema());
    assert.strictEqual(db.schema('audit'), db.schema('audit'));
    assert.notStrictEqual(db.schema(), db.schema('audit'));
  });

  it('leaves the declared component untouched while collections are registered', () => {
    const { db } = createTestDb();
    const declared = db.schema.component;

    assert.deepStrictEqual(migrationNames(db.schema.migrations), []);

    const scoped = db.schema('audit').collection('entries');
    const direct = db.collection('entries', {
      databaseSchemaName: 'audit',
    });

    assert.strictEqual(scoped, direct);
    assert.strictEqual(db.schema.component, declared);
    assert.strictEqual(scoped.schema.component.databaseSchemaName, 'audit');
    assert.deepStrictEqual(
      scoped.schema.component.migrations().map((migration) => migration.name),
      ['table:pongo_collection:entries:create'],
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:audit:create',
      'table:pongo_collection:audit:entries:create',
    ]);
    assert.strictEqual(declared.schemas.audit, undefined);
    assert.deepStrictEqual(Object.keys(declared.tables), []);
  });

  it('creates schema-qualified collection components lazily', () => {
    const { db } = createTestDb();

    const collection = db.collection('users', {
      databaseSchemaName: 'crm',
    });
    const repeated = db.collection('users', {
      databaseSchemaName: 'crm',
    });

    assert.strictEqual(collection.collectionName, 'users');
    assert.strictEqual(collection.schema.component, repeated.schema.component);
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
    ]);
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
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'table:pongo_collection:users:create',
      'schema:public:create',
      'table:pongo_collection:public:users:create',
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
    ]);
  });

  it('searches a configured default schema and a schema of that name as one namespace', () => {
    const users = pongoSchema.collection('users', {
      databaseSchemaName: 'crm',
    });
    const { db } = createTestDb({
      defaultSchemaName: 'crm',
      definition: pongoSchema.db('test', {
        collections: { crmUsers: users },
      }),
    });

    assert.strictEqual(db.collection('users').schema.component, users);
    assert.strictEqual(
      db.collection('users', { databaseSchemaName: 'crm' }).schema.component,
      users,
    );
    assert.strictEqual(
      db.collection('orders').schema.component.tableName,
      'orders',
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
      'table:pongo_collection:crm:orders:create',
    ]);
    assert.ok(
      migrationNames(db.schema.migrations).includes(
        'table:pongo_collection:crm:orders:create',
      ),
    );
  });

  it('creates a schema migration only for a dynamic scope no declaration covers', () => {
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {
            users: pongoSchema.collection('users'),
          }),
        },
      }),
    });

    db.collection('orders', { databaseSchemaName: 'crm' });
    db.collection('entries', { databaseSchemaName: 'audit' });

    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
      'table:pongo_collection:crm:orders:create',
      'schema:audit:create',
      'table:pongo_collection:audit:entries:create',
    ]);
  });

  it('rejects two declared collections resolving to the same physical table', () => {
    const { db } = createTestDb({
      defaultSchemaName: 'crm',
      definition: pongoSchema.db('test', {
        collections: {
          users: pongoSchema.collection('users'),
          crmUsers: pongoSchema.collection('users', {
            databaseSchemaName: 'crm',
          }),
        },
      }),
    });

    assert.throws(
      () => db.collection('users'),
      /Table "users" is declared more than once in database schema "crm"/,
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
    assert.deepStrictEqual(Object.keys(db.schema.component.tables), []);
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

  it('reuses a collection declared by a table extension attached to a named schema', () => {
    const users = pongoSchema.collection('users');
    const crmExtension = dumboSchema.extension('crm-extension', {
      tables: { users },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema('crm', {}, { crmExtension }),
        },
      }),
    });

    const collection = db.collection('users', { databaseSchemaName: 'crm' });

    assert.strictEqual(collection.schema.component, users);
    assert.deepStrictEqual(
      Object.keys(db.schema.component.schemas.crm?.tables ?? {}),
      [],
    );
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'schema:crm:create',
      'table:pongo_collection:crm:users:create',
    ]);
  });

  it('reuses a collection declared by a table extension bound to the default schema', () => {
    const users = pongoSchema.collection('users');
    const eventStore = dumboSchema.extension('event-store', {
      tables: { users },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', { schemas: {} }, { eventStore }),
    });

    const collection = db.collection('users');

    assert.strictEqual(collection.schema.component, users);
    assert.deepStrictEqual(migrationNames(db.schema.migrations), [
      'table:pongo_collection:users:create',
    ]);
  });

  it('rejects a collection matching more than one table in the same schema', () => {
    const crmExtension = dumboSchema.extension('crm-extension', {
      tables: { users: pongoSchema.collection('users') },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: {
          crm: pongoSchema.schema(
            'crm',
            { users: pongoSchema.collection('users') },
            { crmExtension },
          ),
        },
      }),
    });

    assert.throws(
      () => db.collection('users', { databaseSchemaName: 'crm' }),
      /Table "users" is declared more than once in database schema "crm"/,
    );
  });

  it('rejects a collection whose physical table is not a Pongo collection', () => {
    const legacy = dumboSchema.extension('legacy', {
      tables: {
        users: dumboSchema.table('users', {
          columns: {
            id: dumboSchema.column('id', SQL.column.type.Text, {
              primaryKey: true,
            }),
          },
        }),
      },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', {
        schemas: { crm: pongoSchema.schema('crm', {}, { legacy }) },
      }),
    });

    assert.throws(
      () => db.collection('users', { databaseSchemaName: 'crm' }),
      /Table "users" in database schema "crm" is not a Pongo collection/,
    );
  });

  it('registers an undeclared collection on a database that has an extension', () => {
    const eventStore = dumboSchema.extension('event-store', {
      schemas: {
        readmodels: dumboSchema.schema('readmodels', {
          summaries: pongoSchema.collection('summaries'),
        }),
      },
    });
    const { db } = createTestDb({
      definition: pongoSchema.db('test', { schemas: {} }, { eventStore }),
    });

    const collection = db.collection('users', { databaseSchemaName: 'crm' });

    assert.strictEqual(collection.collectionName, 'users');
    assert.strictEqual(db.schema.component.schemas.crm, undefined);
    assert.ok(
      migrationNames(db.schema.migrations).includes(
        'table:pongo_collection:crm:users:create',
      ),
    );
    assert.ok(
      migrationNames(db.schema.migrations).includes(
        'table:pongo_collection:readmodels:summaries:create',
      ),
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
