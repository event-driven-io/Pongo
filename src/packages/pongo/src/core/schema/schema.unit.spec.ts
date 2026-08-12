import assert from 'node:assert';
import {
  databaseComponentType,
  databaseSchemaComponentType,
  defaultDatabaseSchemaKey,
  dumboSchema,
  indexComponentType,
  isJSONDocumentIndexTarget,
  isJSONPathIndexTarget,
  isTableComponent,
  schemaComponentType,
  SQL,
  SQLDefaultSchemaNameToken,
  sqlMigration,
} from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import {
  isPongoCollectionComponent,
  pongoCollectionComponentType,
  pongoDocumentType,
  pongoSchema,
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
    assert.ok(email.target && isJSONPathIndexTarget(email.target));
    assert.strictEqual(email.target.path, 'email');
    assert.strictEqual(externalId.indexName, 'users_external_id_uq');
    assert.ok(externalId.target && isJSONPathIndexTarget(externalId.target));
    assert.deepStrictEqual(externalId.target.path, ['external', 'id']);
    assert.strictEqual(externalId.isUnique, true);
    assert.strictEqual(document.indexName, 'users_data_idx');
    assert.ok(document.target && isJSONDocumentIndexTarget(document.target));
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
      crm: dumboSchema.schema('crm', {
        users,
        accounts: dumboSchema.table('accounts', {
          columns: {
            id: dumboSchema.column('id', SQL.column.type.Text),
          },
        }),
      }),
    });

    assert.deepStrictEqual(
      database.migrations().map(({ name }) => name),
      [
        'schema:relational:crm:001:create',
        'table:pongo_collection:crm:users:001:create',
        'index:pongo_index:crm:users:users_email_idx:001:create',
        'index:pongo_index:crm:users:users_external_id_uq:001:create',
        'index:pongo_index:crm:users:users_data_idx:001:create',
        'index:pongo_index:crm:users:users_search_idx:001:create',
        'table:relational:crm:accounts:001:create',
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
    assert.strictEqual(users.databaseSchemaName, undefined);
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
        .some(
          ({ name }) => name === 'table:pongo_collection:crm:users:001:create',
        ),
      true,
    );
    assert.strictEqual(crm.tables.users.tableName, users.tableName);
    assert.strictEqual(
      crm.tables.users.indexes.email.indexName,
      email.indexName,
    );
    assert.strictEqual(users.databaseSchemaName, undefined);
    assert.strictEqual(crm.tables.users.databaseSchemaName, undefined);
    assert.strictEqual(crm.tables.accounts.databaseSchemaName, undefined);
    assert.strictEqual(isPongoCollectionComponent(crm.tables.users), true);
    expectTypeOf(crm.tables.users[pongoDocumentType]).toEqualTypeOf<User>();
  });

  it('accepts a collection placement constraint that matches its schema', () => {
    const entries = pongoSchema.collection('entries', {
      databaseSchemaName: 'audit',
    });
    const audit = pongoSchema.schema('audit', { auditEntries: entries });

    assert.strictEqual(entries.databaseSchemaName, 'audit');
    assert.strictEqual(audit.tables.auditEntries.databaseSchemaName, 'audit');
  });

  it('rejects declaring a collection for one schema and putting it in another', () => {
    assert.throws(
      () =>
        pongoSchema.schema('public', {
          entries: pongoSchema.collection('entries', {
            databaseSchemaName: 'audit',
          }),
        }),
      /constrained to database schema "audit".*cannot be placed in "public"/,
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
  it('declares a reusable default schema component', () => {
    const schema = pongoSchema.defaultSchema({
      users: pongoSchema.collection<User>('users'),
    });

    assert.strictEqual(
      schema[schemaComponentType],
      databaseSchemaComponentType,
    );
    assert.ok(SQLDefaultSchemaNameToken.check(schema.schemaName));
  });

  it('keeps a reusable default schema under its database record key', () => {
    const reusable = pongoSchema.defaultSchema({
      users: pongoSchema.collection<User>('users'),
    });
    const database = pongoSchema.db('app', {
      schemas: { public: reusable },
    });

    assert.ok(SQLDefaultSchemaNameToken.check(reusable.schemaName));
    assert.strictEqual(database.schemas.public, reusable);
    assert.deepStrictEqual(database.migrations(), reusable.migrations());
    assert.ok(
      SQLDefaultSchemaNameToken.check(database.schemas.public.schemaName),
    );
    assert.strictEqual(
      database.schemas.public.tables.users.databaseSchemaName,
      undefined,
    );
  });

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

  it('normalises direct collections into database schemas without inventing a default schema name', () => {
    const database = pongoSchema.db('app', {
      collections: {
        users: pongoSchema.collection<User>('users'),
        auditEntries: pongoSchema.collection('entries', {
          databaseSchemaName: 'audit',
        }),
      },
    });

    assert.strictEqual(database[schemaComponentType], databaseComponentType);
    assert.strictEqual(database.databaseName, 'app');
    assert.strictEqual(database.collections.users.tableName, 'users');
    assert.strictEqual(
      database.collections.users.databaseSchemaName,
      undefined,
    );
    assert.ok(
      SQLDefaultSchemaNameToken.check(
        database.schemas[defaultDatabaseSchemaKey]?.schemaName,
      ),
    );
    assert.strictEqual(
      database.schemas[defaultDatabaseSchemaKey]?.tables.users?.tableName,
      'users',
    );
    assert.strictEqual(database.schemas.audit?.schemaName, 'audit');
    assert.strictEqual(
      database.schemas.audit?.tables.auditEntries?.tableName,
      'entries',
    );
  });

  it('keeps an empty default schema for an empty direct-collection database', () => {
    const database = pongoSchema.db('app', {
      collections: {},
    });

    assert.deepStrictEqual(Object.keys(database.schemas), [
      defaultDatabaseSchemaKey,
    ]);
    assert.ok(
      SQLDefaultSchemaNameToken.check(
        database.schemas[defaultDatabaseSchemaKey]?.schemaName,
      ),
    );
    assert.deepStrictEqual(
      Object.keys(database.schemas[defaultDatabaseSchemaKey]?.tables ?? {}),
      [],
    );
  });

  it('keeps an empty default schema when every direct collection names another schema', () => {
    const database = pongoSchema.db('app', {
      collections: {
        auditEntries: pongoSchema.collection('entries', {
          databaseSchemaName: 'audit',
        }),
      },
    });

    assert.ok(
      SQLDefaultSchemaNameToken.check(
        database.schemas[defaultDatabaseSchemaKey]?.schemaName,
      ),
    );
    assert.deepStrictEqual(
      Object.keys(database.schemas[defaultDatabaseSchemaKey]?.tables ?? {}),
      [],
    );
    assert.strictEqual(
      database.schemas.audit?.tables.auditEntries?.tableName,
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

  it('does not promote collections from named schemas onto the database', () => {
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

    assert.strictEqual('collections' in database, false);
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
