import assert from 'node:assert';
import {
  dumboSchema,
  isDatabaseComponent,
  isDatabaseSchemaComponent,
  isIndexComponent,
  isJSONDocumentIndexTarget,
  isJSONPathIndexTarget,
  isTableComponent,
  resolveDatabaseSchemaName,
  SQL,
} from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import {
  isPongoCollectionComponent,
  isPongoDatabaseComponent,
  isPongoSchemaComponent,
  pongoCollectionComponentType,
  pongoDatabaseComponentType,
  pongoDocumentType,
  pongoSchema,
  pongoSchemaComponentType,
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
    assert.strictEqual(isIndexComponent(email), true);
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
    assert.strictEqual(isIndexComponent(custom), true);
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

    assert.strictEqual(crm.tables.users, crm.components.users);
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

  it('rejects qualifying a constrained collection placed in another schema', () => {
    const publicSchema = pongoSchema.schema('public', {
      entries: pongoSchema.collection('entries', {
        databaseSchemaName: 'audit',
      }),
    });

    assert.throws(
      () =>
        resolveDatabaseSchemaName(
          publicSchema.tables.entries,
          'Collection "entries"',
        ),
      /constrained to database schema "audit".*placed in "public"/,
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
  it('declares an unnamed reusable schema component', () => {
    const schema = pongoSchema.schema({
      users: pongoSchema.collection<User>('users'),
    });

    assert.strictEqual(isDatabaseSchemaComponent(schema), true);
    assert.strictEqual(isPongoSchemaComponent(schema), true);
    assert.strictEqual(schema.schemaName, undefined);
    assert.strictEqual(schema[pongoSchemaComponentType], true);
  });

  it('keeps an unnamed reusable schema under its database record key', () => {
    const reusable = pongoSchema.schema({
      users: pongoSchema.collection<User>('users'),
    });
    const database = pongoSchema.db('app', {
      schemas: { public: reusable },
    });

    assert.strictEqual(reusable.schemaName, undefined);
    assert.strictEqual(database.schemas.public, database.components.public);
    assert.strictEqual(database.schemas.public.schemaName, undefined);
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

  it('declares direct collections without inventing a default schema name', () => {
    const database = pongoSchema.db('app', {
      collections: {
        users: pongoSchema.collection<User>('users'),
      },
    });

    assert.strictEqual(isDatabaseComponent(database), true);
    assert.strictEqual(isPongoDatabaseComponent(database), true);
    assert.strictEqual(database.databaseName, 'app');
    assert.strictEqual(database.collections.users.tableName, 'users');
    assert.strictEqual(
      database.collections.users.databaseSchemaName,
      undefined,
    );
    assert.deepStrictEqual(Object.keys(database.schemas), []);
    assert.strictEqual(database[pongoDatabaseComponentType], true);
  });

  it('does not promote collections from named schemas onto the database', () => {
    const database = pongoSchema.db('app', {
      schemas: {
        crm: pongoSchema.schema({
          users: pongoSchema.collection<User>('users'),
        }),
        audit: pongoSchema.schema({
          users: pongoSchema.collection<User>('users'),
        }),
      },
    });

    assert.strictEqual('collections' in database, false);
    assert.strictEqual(database.schemas.crm.tables.users.tableName, 'users');
    assert.strictEqual(database.schemas.audit.tables.users.tableName, 'users');
  });

  it('attaches the same direct extension-map shape to schemas and databases', () => {
    const eventStore = dumboSchema.extension('event-store', {});
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

    assert.strictEqual(
      audit.extensions.eventStore,
      audit.components.eventStore,
    );
    assert.strictEqual(
      database.extensions.eventStore,
      database.components.eventStore,
    );
    assert.strictEqual(
      database.extensions.eventStore.extensionName,
      eventStore.extensionName,
    );
  });

  it('leaves frozen collection and schema source records unchanged', () => {
    const users = pongoSchema.collection<User>('users');
    const collections = Object.freeze({ users });
    const publicSchema = pongoSchema.schema(collections);
    const schemas = Object.freeze({ public: publicSchema });

    pongoSchema.db('app', { schemas });

    assert.deepStrictEqual(Object.keys(collections), ['users']);
    assert.strictEqual(collections.users, users);
    assert.deepStrictEqual(Object.keys(schemas), ['public']);
    assert.strictEqual(schemas.public, publicSchema);
  });
});
