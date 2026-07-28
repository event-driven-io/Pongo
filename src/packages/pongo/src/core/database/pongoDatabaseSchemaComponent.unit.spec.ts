import assert from 'node:assert';
import {
  dumboSchema,
  isDatabaseComponent,
  isIndexComponent,
  SQL,
  sqlMigration,
} from '@event-driven-io/dumbo';
import { describe, it } from 'vitest';
import type { PongoCollectionSQLBuilder } from '../collection';
import {
  isPongoCollectionComponent,
  pongoCollectionComponentType,
  pongoSchema,
} from '../schema';
import {
  findPongoDatabaseComponent,
  materializePongoDatabaseComponent,
} from './pongoDatabaseSchemaComponent';

const emptySQL = () => SQL``;
const unusedSQLBuilder: PongoCollectionSQLBuilder = {
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

const materialize = (definition: ReturnType<typeof pongoSchema.db>) =>
  materializePongoDatabaseComponent({
    driverType: 'test:test',
    databaseName: 'app',
    defaultSchemaName: 'public',
    definition,
    sqlBuilderFor: () => unusedSQLBuilder,
    migrationsFor: (component, context) =>
      isPongoCollectionComponent(component)
        ? [
            sqlMigration(
              `${context.databaseSchemaName}.${component.tableName}:table`,
              [SQL`SELECT 1`],
            ),
          ]
        : [],
  });

describe('materializing a Pongo database declaration', () => {
  it('materializes a Pongo database as a Dumbo database component', () => {
    const component = materialize(
      pongoSchema.db('app', {
        collections: {
          users: pongoSchema.collection('users'),
        },
      }),
    );

    assert.strictEqual(isDatabaseComponent(component), true);
    assert.strictEqual(component.databaseName, 'app');
    assert.strictEqual(component.schemas.public?.schemaName, 'public');
    assert.strictEqual(component.collections.length, 1);
  });

  it('registers a lazily created collection and its migrations in the live tree', () => {
    const component = materialize(pongoSchema.db('app', { collections: {} }));

    const collection = component.collection(
      pongoSchema.collection('users'),
      'public',
    );

    assert.strictEqual(collection.collectionName, 'users');
    assert.strictEqual(component.collections.length, 1);
    assert.strictEqual(component.schemas.public?.tables.users, collection);
    assert.deepStrictEqual(
      component.migrations.map((migration) => migration.name),
      ['public.users:table'],
    );
  });

  it('keeps the same collection name in different schemas as separate components', () => {
    const component = materialize(pongoSchema.db('app', { collections: {} }));

    const publicUsers = component.collection(
      pongoSchema.collection('users'),
      'public',
    );
    const crmUsers = component.collection(
      pongoSchema.collection('users'),
      'crm',
    );

    assert.notStrictEqual(publicUsers, crmUsers);
    assert.strictEqual(publicUsers.databaseSchemaName, 'public');
    assert.strictEqual(crmUsers.databaseSchemaName, 'crm');
    assert.strictEqual(component.collections.length, 2);
  });

  it('materializes collections already grouped in named schemas', () => {
    const component = materialize(
      pongoSchema.db('app', {
        schemas: {
          crm: pongoSchema.schema({
            users: pongoSchema.collection('users'),
          }),
          audit: pongoSchema.schema({
            users: pongoSchema.collection('users'),
          }),
        },
      }),
    );

    assert.deepStrictEqual(
      component.collections.map((collection) => [
        collection.databaseSchemaName,
        collection.tableName,
      ]),
      [
        ['crm', 'users'],
        ['audit', 'users'],
      ],
    );
  });

  it('reuses a declared collection when its record alias differs from its table name', () => {
    const component = materialize(
      pongoSchema.db('app', {
        schemas: {
          crm: pongoSchema.schema({
            crmUsers: pongoSchema.collection('users'),
          }),
        },
      }),
    );
    const declared = component.schemas.crm!.tables.crmUsers!;

    const resolved = component.collection(
      pongoSchema.collection('users'),
      'crm',
    );

    assert.strictEqual(resolved, declared);
    assert.deepStrictEqual(
      component.migrations.map((migration) => migration.name),
      ['crm.users:table'],
    );
  });

  it('rejects a direct collection constrained to a different default schema', () => {
    assert.throws(
      () =>
        materialize(
          pongoSchema.db('app', {
            collections: {
              entries: pongoSchema.collection('entries', {
                databaseSchemaName: 'audit',
              }),
            },
          }),
        ),
      /Table "entries" is constrained to database schema "audit" and cannot be placed in "public"/,
    );
  });

  it('creates fresh contextual tables and indexes without changing declarations', () => {
    const users = pongoSchema.collection('users', {
      indexes: {
        email: pongoSchema.index('users_email_idx', 'email'),
      },
    });
    const component = materialize(
      pongoSchema.db('app', {
        schemas: {
          crm: pongoSchema.schema({ users }),
        },
      }),
    );
    const materialized = component.schemas.crm!.tables.users!;

    assert.notStrictEqual(materialized, users);
    assert.notStrictEqual(materialized.indexes.email, users.indexes.email);
    assert.strictEqual(users.databaseSchemaName, undefined);
    assert.strictEqual(users.indexes.email.databaseSchemaName, undefined);
    assert.strictEqual(materialized.databaseSchemaName, 'crm');
    assert.strictEqual(materialized.indexes.email?.databaseSchemaName, 'crm');
  });

  it('orders table migrations before migrations owned by index children', () => {
    const definition = pongoSchema.db('app', {
      collections: {
        users: pongoSchema.collection('users', {
          indexes: {
            email: pongoSchema.index('users_email_idx', 'email'),
            document: pongoSchema.index.json('users_data_idx'),
          },
        }),
      },
    });
    const component = materializePongoDatabaseComponent({
      driverType: 'test:test',
      databaseName: 'app',
      defaultSchemaName: 'public',
      definition,
      sqlBuilderFor: () => unusedSQLBuilder,
      migrationsFor: (schemaComponent) => {
        if (isPongoCollectionComponent(schemaComponent)) {
          return [sqlMigration('users:table', [SQL`SELECT 1`])];
        }
        if (isIndexComponent(schemaComponent)) {
          return [
            sqlMigration(`users:index:${schemaComponent.indexName}`, [
              SQL`SELECT 1`,
            ]),
          ];
        }
        return [];
      },
    });

    assert.deepStrictEqual(
      component.migrations.map((migration) => migration.name),
      [
        'users:table',
        'users:index:users_email_idx',
        'users:index:users_data_idx',
      ],
    );
  });

  it('preserves collection specialization after materialization', () => {
    const component = materialize(
      pongoSchema.db('app', {
        collections: {
          users: pongoSchema.collection('users'),
        },
      }),
    );
    const collection = component.schemas.public!.tables.users!;

    assert.strictEqual(collection[pongoCollectionComponentType], true);
    assert.strictEqual(isPongoCollectionComponent(collection), true);
    assert.strictEqual(collection.databaseSchemaName, 'public');
  });

  it('uses database and schema components directly without an extension wrapper', () => {
    const component = materialize(
      pongoSchema.db('app', {
        collections: {
          users: pongoSchema.collection('users'),
        },
      }),
    );

    assert.deepStrictEqual(Object.keys(component.extensions), []);
    assert.deepStrictEqual(Object.keys(component.schemas), ['public']);
    assert.deepStrictEqual(Object.keys(component.schemas.public!.tables), [
      'users',
    ]);
  });

  it('creates an empty declaration when runtime configuration has none', () => {
    const component = materializePongoDatabaseComponent({
      driverType: 'test:test',
      databaseName: 'app',
      defaultSchemaName: 'public',
      sqlBuilderFor: () => unusedSQLBuilder,
    });

    assert.strictEqual(component.databaseName, 'app');
    assert.deepStrictEqual(Object.keys(component.schemas.public!.tables), []);
    assert.strictEqual(component.collections.length, 0);
  });

  it('finds a materialized Pongo database inside a Dumbo component tree', () => {
    const database = materialize(
      pongoSchema.db('app', {
        collections: {
          users: pongoSchema.collection('users'),
        },
      }),
    );
    const root = dumboSchema.extension('root', { database });

    assert.strictEqual(findPongoDatabaseComponent(root, 'app'), database);
  });

  it('does not expose regular Dumbo tables as Pongo collections', () => {
    const component = materialize(pongoSchema.db('app', { collections: {} }));
    component.editor.setTable(
      'public',
      'regularUsers',
      dumboSchema.table('users'),
    );
    component.collection(pongoSchema.collection('events'), 'public');

    assert.deepStrictEqual(
      component.collections.map((collection) => collection.collectionName),
      ['events'],
    );
  });
});
