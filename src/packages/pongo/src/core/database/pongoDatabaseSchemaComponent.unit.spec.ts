import assert from 'node:assert';
import { describe, expectTypeOf, it } from 'vitest';
import {
  databaseSchemaComponent,
  dumboSchema,
  SQL,
  sqlMigration,
} from '@event-driven-io/dumbo';
import {
  PongoCollectionSchemaComponent,
  type PongoCollectionURN,
  type PongoCollectionSchemaComponent as PongoCollectionSchemaComponentType,
} from '../collection';
import { pongoSchema } from '../schema';
import {
  PongoDatabaseSchemaComponent,
  PongoDatabaseURNType,
  pongoCollectionsSchema,
  pongoDatabaseSchemaComponentFor,
} from './pongoDatabaseSchemaComponent';

const collectionFactory = (
  schema: ReturnType<typeof pongoSchema.collection>,
): PongoCollectionSchemaComponentType =>
  PongoCollectionSchemaComponent({
    driverType: 'test:test',
    definition: schema,
    migrations: [sqlMigration(`${schema.tableName}:001`, [SQL`SELECT 1`])],
    sqlBuilder: {} as never,
  });

describe('PongoDatabaseSchemaComponent', () => {
  it('uses Pongo database component keys', () => {
    const component = PongoDatabaseSchemaComponent({
      driverType: 'test:test',
      definition: pongoSchema.db('app', {
        users: pongoSchema.collection('users'),
      }),
      collectionFactory,
    });

    assert.strictEqual(
      component.schemaComponentKey,
      `${PongoDatabaseURNType}:app`,
    );
    assert.strictEqual(component.collections.length, 1);
  });

  it('adds collection components and migrations when collection is created lazily', () => {
    const component = PongoDatabaseSchemaComponent({
      driverType: 'test:test',
      definition: pongoSchema.db('app', {}),
      collectionFactory,
    });

    const collection = component.collection(pongoSchema.collection('users'));

    assert.strictEqual(collection.collectionName, 'users');
    assert.strictEqual(component.collections.length, 1);
    assert.strictEqual(
      component.components.has(
        `sc:dumbo:table:pongo_collection:${dumboSchema.schema.defaultName}:users`,
      ),
      true,
    );
    assert.strictEqual(component.migrations.length, 1);
  });

  it('keeps same collection names in different schemas as separate components', () => {
    const component = PongoDatabaseSchemaComponent({
      driverType: 'test:test',
      definition: pongoSchema.db('app', {}),
      collectionFactory,
    });

    const defaultUsers = component.collection(pongoSchema.collection('users'));
    const crmUsers = component.collection(
      pongoSchema.collection('users', { schema: 'crm' }),
    );

    assert.notStrictEqual(defaultUsers, crmUsers);
    assert.strictEqual(component.collections.length, 2);
    assert.deepStrictEqual(
      component.collections.map((collection) => collection.schemaComponentKey),
      [
        `sc:dumbo:table:pongo_collection:${dumboSchema.schema.defaultName}:users`,
        'sc:dumbo:table:pongo_collection:crm:users',
      ],
    );
  });

  it('uses a single collection URN shape', () => {
    const collection = PongoCollectionSchemaComponent({
      driverType: 'test:test',
      definition: pongoSchema.collection('users'),
      sqlBuilder: {} as never,
    });

    expectTypeOf(
      collection.pongoCollectionComponentKey,
    ).toMatchTypeOf<PongoCollectionURN>();
    assert.strictEqual(
      collection.pongoCollectionComponentKey,
      `sc:pongo:collection:${dumboSchema.schema.defaultName}:users`,
    );
    assert.strictEqual(
      collection.databaseSchemaName,
      dumboSchema.schema.defaultName,
    );
  });
});

describe('pongoCollectionsSchema', () => {
  it('wraps Pongo database components as an opaque Dumbo feature', () => {
    const feature = pongoCollectionsSchema(
      'app',
      pongoSchema.db({
        users: pongoSchema.collection('users'),
      }),
      {
        driverType: 'test:test',
        collectionFactory,
      },
    );

    assert.strictEqual(
      feature.schemaComponentKey,
      'sc:dumbo:feature:pongo_collections:app',
    );
    assert.strictEqual(
      feature.database.schemaComponentKey,
      'sc:pongo:database:app',
    );
    assert.strictEqual(feature.migrations.length, 1);

    const database = feature.components.get('sc:pongo:database:app');
    const collections = Array.from(database?.components.values() ?? []);

    assert.strictEqual(collections.length, 1);
    assert.strictEqual(
      (collections[0] as PongoCollectionSchemaComponentType | undefined)
        ?.collectionName,
      'users',
    );
  });
});

describe('pongoDatabaseSchemaComponentFor', () => {
  it('keeps plain Pongo DB definitions compatible', () => {
    const component = pongoDatabaseSchemaComponentFor({
      databaseName: 'app',
      driverType: 'test:test',
      definition: pongoSchema.db({
        users: pongoSchema.collection('users'),
      }),
      collectionFactory,
    });

    assert.strictEqual(component.definition.name, 'app');
    assert.strictEqual(component.collections.length, 1);
  });

  it('gets a Pongo database component from a database schema component', () => {
    const feature = pongoCollectionsSchema(
      'app',
      pongoSchema.db({
        users: pongoSchema.collection('users'),
      }),
      {
        driverType: 'test:test',
        collectionFactory,
      },
    );
    const database = databaseSchemaComponent({
      databaseName: 'app',
      components: [feature],
    });

    const component = pongoDatabaseSchemaComponentFor({
      databaseName: 'app',
      driverType: 'test:test',
      definition: database,
      collectionFactory,
    });

    assert.strictEqual(
      component.schemaComponentKey,
      feature.database.schemaComponentKey,
    );
    assert.strictEqual(component.collections.length, 1);
  });
});
