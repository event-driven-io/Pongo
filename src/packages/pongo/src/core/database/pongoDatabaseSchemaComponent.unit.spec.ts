import assert from 'node:assert';
import { describe, it } from 'vitest';
import { SQL, sqlMigration } from '@event-driven-io/dumbo';
import {
  PongoCollectionSchemaComponent,
  type PongoCollectionSchemaComponent as PongoCollectionSchemaComponentType,
} from '../collection';
import { pongoSchema } from '../schema';
import {
  PongoDatabaseSchemaComponent,
  PongoDatabaseURNType,
  pongoCollectionsSchema,
} from './pongoDatabaseSchemaComponent';

const collectionFactory = (
  schema: ReturnType<typeof pongoSchema.collection>,
): PongoCollectionSchemaComponentType =>
  PongoCollectionSchemaComponent({
    driverType: 'test:test',
    definition: schema,
    migrationsOrSchemaComponents: {
      migrations: [sqlMigration(`${schema.name}:001`, [SQL`SELECT 1`])],
    },
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
      component.components.has('sc:pongo:collection:users'),
      true,
    );
    assert.strictEqual(component.migrations.length, 1);
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
