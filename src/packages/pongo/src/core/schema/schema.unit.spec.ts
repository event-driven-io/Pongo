import assert from 'node:assert';
import {
  databaseComponentType,
  dumboSchema,
  indexComponentType,
  isTableComponent,
  schemaComponentType,
  SQL,
  SQLDefaultSchemaNameToken,
  sqlMigration,
  type TableRowType,
} from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import {
  isPongoCollectionComponent,
  pongoCollectionComponentType,
  pongoSchema,
  toDbSchemaMetadata,
  type PongoCollectionIndexSQLContext,
} from './index';

type User = {
  email: string;
};

describe('declaring Pongo indexes', () => {
  it('declares path, unique path, and whole-document indexes as Dumbo indexes', () => {
    const email = pongoSchema.index('users_email_idx', 'email');
    const externalId = pongoSchema.index.unique('users_external_id_uq', [
      'external',
      'id',
    ]);
    const document = pongoSchema.index.json('users_data_idx');

    assert.strictEqual(email.indexName, 'users_email_idx');
    assert.ok(email.target?.targetType === 'jsonPath');
    assert.strictEqual(email.target.path, 'email');
    assert.strictEqual(externalId.indexName, 'users_external_id_uq');
    assert.ok(externalId.target?.targetType === 'jsonPath');
    assert.deepStrictEqual(externalId.target.path, ['external', 'id']);
    assert.strictEqual(externalId.isUnique, true);
    assert.strictEqual(document.indexName, 'users_data_idx');
    assert.ok(document.target?.targetType === 'jsonDocument');
    assert.strictEqual(email[schemaComponentType], indexComponentType);
  });

  it('keeps explicit index names as typed collection aliases', () => {
    const collection = pongoSchema.collection('users', {
      indexes: {
        email: pongoSchema.index('users_email_idx', 'email'),
        document: pongoSchema.index.json('users_data_idx'),
      },
    });

    assert.strictEqual(collection.indexes.email.indexName, 'users_email_idx');
    assert.strictEqual(collection.indexes.document.indexName, 'users_data_idx');
    assert.strictEqual(collection.indexes.email, collection.indexes.email);
  });

  it('passes logical and resolved references to a custom index SQL callback', () => {
    const sql = ({
      tableName,
      indexName,
      tableReference,
      indexReference,
    }: PongoCollectionIndexSQLContext) =>
      SQL`CREATE INDEX ${indexReference} ON ${tableReference} (${SQL.identifier(`${tableName}_${indexName}`)})`;
    const custom = pongoSchema.index.custom('users_search_idx', sql);

    assert.strictEqual(custom.indexName, 'users_search_idx');
    assert.strictEqual(custom.sql, sql);
    assert.strictEqual(custom[schemaComponentType], indexComponentType);
  });

  it('uses Pongo kinds only for collection tables and indexes', () => {
    const users = pongoSchema.collection<User>('users', {
      indexes: {
        email: pongoSchema.index('users_email_idx', 'email'),
        externalId: pongoSchema.index.unique('users_external_id_uq', [
          'external',
          'id',
        ]),
        document: pongoSchema.index.json('users_data_idx'),
        custom: pongoSchema.index.custom(
          'users_search_idx',
          ({ tableReference }) => SQL`SELECT ${tableReference}`,
        ),
      },
    });
    const database = dumboSchema.database({
      schemas: {
        crm: dumboSchema.schema('crm', {
          users,
          accounts: dumboSchema.table('accounts', {
            columns: {
              id: dumboSchema.column('id', SQL.column.type.Text),
            },
          }),
        }),
      },
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'schema:crm:create',
        'table:pongo_collection:crm:users:create',
        'index:pongo_index:crm:users:users_email_idx:create',
        'index:pongo_index:crm:users:users_external_id_uq:create',
        'index:pongo_index:crm:users:users_data_idx:create',
        'index:pongo_index:crm:users:users_search_idx:create',
        'table:crm:accounts:create',
      ],
    );
  });
});

describe('declaring Pongo collections', () => {
  it('declares a collection as a Dumbo table with its physical columns', () => {
    const users = pongoSchema.collection<User>('users');

    assert.strictEqual(isTableComponent(users), true);
    assert.strictEqual(isPongoCollectionComponent(users), true);
    assert.strictEqual(users.tableName, 'users');
    assert.deepStrictEqual(Object.keys(users.columns), [
      '_id',
      'data',
      'metadata',
      '_version',
      '_partition',
      '_archived',
      '_created',
      '_updated',
    ]);
    assert.deepStrictEqual(users.primaryKey, ['_id']);
    assert.strictEqual(users.columns._id.primaryKey, true);
    assert.strictEqual(users.columns.data.notNull, true);
    assert.strictEqual(SQL.check.isPlain(users.columns.metadata.default), true);
    assert.strictEqual(users.columns._version.default, 1n);
    assert.strictEqual(users.columns._partition.default, 'png_global');
    assert.strictEqual(users.columns._archived.default, false);
    assert.strictEqual(SQL.check.isPlain(users.columns._created.default), true);
    assert.strictEqual(SQL.check.isPlain(users.columns._updated.default), true);
  });

  it('places a reusable collection in a Dumbo schema without changing it', () => {
    const email = pongoSchema.index('users_email_idx', 'email');
    const users = pongoSchema.collection<
      User,
      'users',
      { email: typeof email }
    >('users', {
      indexes: { email },
    });
    const accounts = dumboSchema.table('accounts');
    const crm = dumboSchema.schema('crm', { accounts, users });

    assert.strictEqual(crm.tables.users, users);
    assert.strictEqual(
      crm
        .migrations()
        .some(({ name }) => name === 'table:pongo_collection:crm:users:create'),
      true,
    );
    assert.strictEqual(crm.tables.users.tableName, users.tableName);
    assert.strictEqual(
      crm.tables.users.indexes.email.indexName,
      email.indexName,
    );
    assert.strictEqual(isPongoCollectionComponent(crm.tables.users), true);
    expectTypeOf<
      TableRowType<typeof crm.tables.users>['data']
    >().toEqualTypeOf<User>();
  });

  it('one collection component can be reused in different schemas', () => {
    const users = pongoSchema.collection<User>('users');
    const crm = pongoSchema.schema('crm', { users });
    const audit = pongoSchema.schema('audit', { users });

    assert.strictEqual(crm.tables.users, users);
    assert.strictEqual(audit.tables.users, users);
    assert.deepStrictEqual(
      crm.migrations().map(({ name }) => name),
      ['schema:crm:create', 'table:pongo_collection:crm:users:create'],
    );
    assert.deepStrictEqual(
      audit.migrations().map(({ name }) => name),
      ['schema:audit:create', 'table:pongo_collection:audit:users:create'],
    );
  });

  it('retains Pongo specialization markers after Dumbo composition', () => {
    const users = pongoSchema.collection<User>('users');
    const crm = dumboSchema.schema('crm', { users });

    assert.strictEqual(users[pongoCollectionComponentType], true);
    assert.strictEqual(crm.tables.users[pongoCollectionComponentType], true);
  });
});

describe('declaring Pongo schemas and databases', () => {
  it('rejects an explicitly named schema stored under another key', () => {
    assert.throws(
      () =>
        pongoSchema.db('app', {
          schemas: {
            audit: pongoSchema.schema('history', {}),
          },
        }),
      /record key "audit" conflicts with its explicit name "history"/,
    );
  });

  it('adds named schemas to a database declared with default collections', () => {
    const database = pongoSchema
      .db('app', {
        collections: {
          users: pongoSchema.collection<User>('users'),
        },
      })
      .withSchema({
        audit: pongoSchema.schema('audit', {
          entries: pongoSchema.collection('entries'),
        }),
      });

    assert.strictEqual(database[schemaComponentType], databaseComponentType);
    assert.strictEqual(database.databaseName, 'app');
    assert.ok(
      SQLDefaultSchemaNameToken.check(database.defaultSchema.schemaName),
    );
    assert.strictEqual(database.tables.users?.tableName, 'users');
    assert.deepStrictEqual(Object.keys(database.schemas), ['audit']);
    assert.strictEqual(database.schemas.audit?.schemaName, 'audit');
    assert.strictEqual(
      database.schemas.audit?.tables.entries?.tableName,
      'entries',
    );
    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'table:pongo_collection:users:create',
        'schema:audit:create',
        'table:pongo_collection:audit:entries:create',
      ],
    );
  });

  it('declares collections in the default schema', () => {
    const database = pongoSchema.db('app', {
      collections: {
        users: pongoSchema.collection<User>('users'),
      },
    });

    assert.strictEqual(
      database.tables.users,
      database.defaultSchema.tables.users,
    );
  });

  it('declares an empty database', () => {
    const database = pongoSchema.db('app', { collections: {} });

    assert.deepStrictEqual(Object.keys(database.schemas), []);
    assert.ok(
      SQLDefaultSchemaNameToken.check(database.defaultSchema.schemaName),
    );
    assert.deepStrictEqual(Object.keys(database.tables), []);
  });

  it('declares collections in named schemas', () => {
    const database = pongoSchema.db('app', {
      schemas: {
        audit: pongoSchema.schema('audit', {
          entries: pongoSchema.collection('entries'),
        }),
      },
    });

    assert.ok(
      SQLDefaultSchemaNameToken.check(database.defaultSchema.schemaName),
    );
    assert.deepStrictEqual(Object.keys(database.tables), []);
    assert.strictEqual(
      database.schemas.audit?.tables.entries?.tableName,
      'entries',
    );
  });

  it('rejects two direct collections with the same table name in one schema', () => {
    assert.throws(
      () =>
        pongoSchema.db('app', {
          collections: {
            users: pongoSchema.collection('users'),
            customerDirectory: pongoSchema.collection('users'),
          },
        }),
      /Table "users" is declared more than once in database schema "the default schema"/,
    );
  });

  it('a parent Pongo schema determines collection placement', () => {
    const database = pongoSchema.db('app', {
      schemas: {
        crm: pongoSchema.schema('crm', {
          users: pongoSchema.collection<User>('users'),
        }),
        audit: pongoSchema.schema('audit', {
          users: pongoSchema.collection<User>('users'),
        }),
      },
    });

    assert.strictEqual(database.schemas.crm.tables.users.tableName, 'users');
    assert.strictEqual(database.schemas.audit.tables.users.tableName, 'users');
  });

  it('attaches the same direct extension-map shape to schemas and databases', () => {
    const migration = sqlMigration('event-store:001', [SQL`SELECT 1`]);
    const eventStore = dumboSchema.extension('event-store', {
      migrations: () => [migration],
    });
    const audit = pongoSchema.schema(
      'audit',
      { auditEntries: pongoSchema.collection('entries') },
      { eventStore },
    );
    const database = pongoSchema.db(
      'app',
      { schemas: { audit } },
      { eventStore },
    );

    assert.strictEqual(audit.migrations().includes(migration), true);
    assert.strictEqual(database.migrations().includes(migration), true);
    assert.strictEqual(
      database.extensions.eventStore.extensionName,
      eventStore.extensionName,
    );
  });

  it('rejects a schema extension attached to a Pongo schema', () => {
    const eventStore = dumboSchema.extension('event-store', {
      schemas: { readmodels: dumboSchema.schema('readmodels', {}) },
    });

    assert.throws(
      () => pongoSchema.schema('audit', {}, { eventStore }),
      /Extension "event-store" contributes database schema "readmodels" and cannot be attached to database schema "audit"/,
    );
  });

  it('places a table extension attached to a Pongo database in its default schema', () => {
    const messages = dumboSchema.table('messages', {
      columns: { id: dumboSchema.column('id', SQL.column.type.Text) },
    });
    const eventStore = dumboSchema.extension('event-store', {
      tables: { messages },
    });
    const database = pongoSchema.db('app', { schemas: {} }, { eventStore });

    assert.strictEqual(
      database.defaultSchema.extensions.eventStore,
      eventStore,
    );
    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      ['table:messages:create'],
    );
  });

  it('leaves frozen collection and schema source records unchanged', () => {
    const users = pongoSchema.collection<User>('users');
    const collections = Object.freeze({ users });
    const publicSchema = pongoSchema.schema('public', collections);
    const schemas = Object.freeze({ public: publicSchema });

    pongoSchema.db('app', { schemas });

    assert.deepStrictEqual(Object.keys(collections), ['users']);
    assert.strictEqual(collections.users, users);
    assert.deepStrictEqual(Object.keys(schemas), ['public']);
    assert.strictEqual(schemas.public, publicSchema);
  });
});

describe('describing a database schema for the CLI', () => {
  it('keeps the schema a collection was declared in', () => {
    const definition = pongoSchema.db({
      schemas: {
        crm: pongoSchema.schema('crm', {
          users: pongoSchema.collection<{ name: string }>('users'),
        }),
      },
    });

    const metadata = toDbSchemaMetadata(definition);

    const rebuilt = pongoSchema.db.from(metadata.name, metadata.collections);

    assert.deepStrictEqual(
      rebuilt.migrations().map(({ name }) => name),
      definition.migrations().map(({ name }) => name),
    );
  });
});
