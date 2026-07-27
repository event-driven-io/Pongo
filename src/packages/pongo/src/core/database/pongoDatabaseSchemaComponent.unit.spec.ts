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
  pongoCollectionsSchema,
  pongoDatabaseSchemaFromDumboComponent,
  pongoDatabaseSchemaFromPongoSchema,
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
  it('uses Dumbo database component identity with Pongo kind', () => {
    const component = PongoDatabaseSchemaComponent({
      driverType: 'test:test',
      definition: pongoSchema.db('app', {
        users: pongoSchema.collection('users'),
      }),
      collectionFactory,
    });

    assert.strictEqual(
      component.schemaComponentKey,
      'sc:dumbo:database:pongo:app',
    );
    assert.strictEqual(component.databaseKind, 'pongo');
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

  it('uses collections already bound by Pongo database schemas', () => {
    const component = PongoDatabaseSchemaComponent({
      driverType: 'test:test',
      definition: pongoSchema.database('app', {
        crm: pongoSchema.schema('crm', {
          users: pongoSchema.collection('users'),
        }),
        audit: pongoSchema.schema('audit', {
          users: pongoSchema.collection('users'),
        }),
      }),
      collectionFactory,
    });

    assert.deepStrictEqual(
      component.collections.map((collection) => collection.schemaComponentKey),
      [
        'sc:dumbo:table:pongo_collection:crm:users',
        'sc:dumbo:table:pongo_collection:audit:users',
      ],
    );
    assert.strictEqual(component.migrations.length, 2);
  });

  it('uses Dumbo table identity as the collection URN shape', () => {
    const collection = PongoCollectionSchemaComponent({
      driverType: 'test:test',
      definition: pongoSchema.collection('users'),
      sqlBuilder: {} as never,
    });

    expectTypeOf(
      collection.schemaComponentKey,
    ).toMatchTypeOf<PongoCollectionURN>();
    assert.strictEqual(
      collection.schemaComponentKey,
      `sc:dumbo:table:pongo_collection:${dumboSchema.schema.defaultName}:users`,
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
      'sc:dumbo:database:pongo:app',
    );
    assert.strictEqual(feature.database.databaseKind, 'pongo');
    assert.strictEqual(feature.migrations.length, 1);

    const database = feature.components.get('sc:dumbo:database:pongo:app');
    const collections = Array.from(database?.components.values() ?? []);

    assert.strictEqual(collections.length, 1);
    assert.strictEqual(
      (collections[0] as PongoCollectionSchemaComponentType | undefined)
        ?.collectionName,
      'users',
    );
  });
});

describe('pongoDatabaseSchemaFromPongoSchema', () => {
  it('keeps plain Pongo DB definitions compatible', () => {
    const component = pongoDatabaseSchemaFromPongoSchema({
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

    const component = pongoDatabaseSchemaFromDumboComponent({
      databaseName: 'app',
      definition: database,
    });

    assert.strictEqual(
      component.schemaComponentKey,
      feature.database.schemaComponentKey,
    );
    assert.strictEqual(component.collections.length, 1);
  });

  it('ignores non-Pongo table children in collections', () => {
    const component = PongoDatabaseSchemaComponent({
      driverType: 'test:test',
      definition: pongoSchema.db('app', {}),
      collectionFactory,
    });

    component.addComponent(
      dumboSchema.table('users', {
        columns: {
          id: dumboSchema.column('id', SQL.column.type.Varchar('max')),
        },
      }),
    );
    component.addComponent(
      PongoCollectionSchemaComponent({
        driverType: 'test:test',
        definition: pongoSchema.collection('events'),
        sqlBuilder: {} as never,
      }),
    );

    assert.deepStrictEqual(
      component.collections.map((collection) => collection.collectionName),
      ['events'],
    );
  });
});
