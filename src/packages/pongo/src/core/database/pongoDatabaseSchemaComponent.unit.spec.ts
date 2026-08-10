import assert from 'node:assert';
import { dumboSchema, isDatabaseComponent } from '@event-driven-io/dumbo';
import { describe, it } from 'vitest';
import {
  isPongoCollectionComponent,
  pongoCollectionComponentType,
  pongoSchema,
  type PongoDatabaseComponent,
} from '../schema';
import { composePongoDatabase } from './pongoDatabaseSchemaComponent';

const compose = (
  definition: PongoDatabaseComponent,
  defaultSchemaName = 'public',
) =>
  composePongoDatabase({
    databaseName: 'app',
    defaultSchemaName,
    definition,
  });

describe('composing a Pongo database hierarchy', () => {
  it('places direct collections in the resolved default schema', () => {
    const users = pongoSchema.collection('users');
    const database = compose(pongoSchema.db('app', { collections: { users } }));

    assert.strictEqual(isDatabaseComponent(database), true);
    assert.strictEqual(database.databaseName, 'app');
    assert.strictEqual(database.schemas.public?.schemaName, 'public');
    assert.strictEqual(
      database.schemas.public?.tables.users?.tableName,
      'users',
    );
  });

  it('uses the resolved default without changing a reusable declaration', () => {
    const users = Object.freeze(pongoSchema.collection('users'));
    const definition = Object.freeze(
      pongoSchema.db('app', {
        collections: Object.freeze({ users }),
      }),
    );

    const first = compose(definition, 'public');
    const second = compose(definition, 'tenant');

    assert.strictEqual(first.schemas.public?.tables.users?.tableName, 'users');
    assert.strictEqual(second.schemas.tenant?.tables.users?.tableName, 'users');
    assert.strictEqual(users.databaseSchemaName, undefined);
    assert.deepStrictEqual(Object.keys(definition.schemas), []);
  });

  it('places a direct collection in an undeclared requested schema', () => {
    const entries = pongoSchema.collection('entries', {
      databaseSchemaName: 'audit',
    });
    const database = compose(
      pongoSchema.db('app', { collections: { entries } }),
    );

    assert.strictEqual(
      database.schemas.audit?.tables.entries?.tableName,
      entries.tableName,
    );
    assert.deepStrictEqual(Object.keys(database.schemas.public!.tables), []);
  });

  it('keeps collections grouped by their declared schema record', () => {
    const crmUsers = pongoSchema.collection('users');
    const auditUsers = pongoSchema.collection('users');
    const database = compose(
      pongoSchema.db('app', {
        schemas: {
          crm: pongoSchema.schema('crm', { users: crmUsers }),
          audit: pongoSchema.schema('audit', { users: auditUsers }),
        },
      }),
    );

    assert.strictEqual(
      database.schemas.crm?.tables.users?.tableName,
      crmUsers.tableName,
    );
    assert.strictEqual(
      database.schemas.audit?.tables.users?.tableName,
      auditUsers.tableName,
    );
  });

  it('rejects a collection placement conflicting with its schema group', () => {
    assert.throws(
      () =>
        compose(
          pongoSchema.db('app', {
            schemas: {
              crm: pongoSchema.schema('crm', {
                users: pongoSchema.collection('users', {
                  databaseSchemaName: 'audit',
                }),
              }),
            },
          }),
        ),
      /constrained to database schema "audit" and cannot be placed in "crm"/,
    );
  });

  it('keeps a collection stored under an alias recognisable as a collection', () => {
    const users = pongoSchema.collection('users', {
      indexes: {
        email: pongoSchema.index('users_email_idx', 'email'),
      },
    });
    const database = compose(
      pongoSchema.db('app', {
        schemas: {
          crm: pongoSchema.schema('crm', { crmUsers: users }),
        },
      }),
    );
    const placed = database.schemas.crm!.tables.crmUsers!;

    assert.strictEqual(placed.tableName, users.tableName);
    assert.strictEqual(
      placed.indexes.email?.indexName,
      users.indexes.email.indexName,
    );
    assert.ok(isPongoCollectionComponent(placed));
    assert.strictEqual(placed[pongoCollectionComponentType], true);
  });

  it('keeps schema and database extensions at their declared boundaries', () => {
    const audit = dumboSchema.extension('audit', {});
    const eventStore = dumboSchema.extension('event-store', {});
    const database = compose(
      pongoSchema.db(
        'app',
        {
          schemas: {
            crm: pongoSchema.schema(
              'crm',
              { users: pongoSchema.collection('users') },
              { audit },
            ),
          },
        },
        { eventStore },
      ),
    );

    assert.strictEqual(
      database.schemas.crm?.extensions.audit?.extensionName,
      audit.extensionName,
    );
    assert.strictEqual(
      database.extensions.eventStore?.extensionName,
      eventStore.extensionName,
    );
    assert.deepStrictEqual(Object.keys(database.schemas.crm.tables), ['users']);
  });

  it('creates an empty resolved default schema for an empty database', () => {
    const database = compose(
      pongoSchema.db('app', {
        collections: {},
      }),
    );

    assert.deepStrictEqual(Object.keys(database.schemas), ['public']);
    assert.deepStrictEqual(Object.keys(database.schemas.public!.tables), []);
  });
});
