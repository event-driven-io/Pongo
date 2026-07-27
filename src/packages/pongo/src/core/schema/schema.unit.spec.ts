import assert from 'node:assert';
import { dumboSchema, SQL } from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import {
  pongoSchema,
  type PongoCollectionSchema,
  type PongoCollectionIndexDefinition,
  type PongoCollectionIndexExtensions,
} from './index';

declare module './index' {
  interface PongoCollectionIndexExtensions {
    custom_jsonb_path: {
      opclass: 'jsonb_path_ops';
      predicate?: string | undefined;
    };
  }
}

describe('pongoSchema indexes', () => {
  it('creates path, unique multi-path, and document JSON index definitions', () => {
    const email = pongoSchema.index('users_email_idx', 'email');
    const externalId = pongoSchema.index.unique('users_external_id_uq', [
      'external',
      'id',
    ]);
    const document = pongoSchema.index.json('users_data_idx');

    assert.strictEqual(email.name, 'users_email_idx');
    assert.strictEqual(email.path, 'email');
    assert.strictEqual(email.unique, undefined);
    assert.strictEqual(email.type, 'json_path');
    assert.strictEqual(externalId.name, 'users_external_id_uq');
    assert.deepStrictEqual(externalId.path, ['external', 'id']);
    assert.strictEqual(externalId.unique, true);
    assert.strictEqual(externalId.type, 'json_path');
    assert.strictEqual(document.name, 'users_data_idx');
    assert.strictEqual(document.type, 'json_document');
  });

  it('preserves custom index metadata for driver or user extensions', () => {
    const customIndex = {
      name: 'users_data_path_ops',
      type: 'custom_jsonb_path',
      path: ['profile', 'tags'],
      sql: ({ tableReference }) =>
        SQL`CREATE INDEX users_data_path_ops ON ${tableReference} USING GIN (data jsonb_path_ops)`,
      options: {
        opclass: 'jsonb_path_ops',
        predicate: "data ? 'profile'",
      },
    } satisfies PongoCollectionIndexDefinition<'custom_jsonb_path'>;

    const collection = pongoSchema.collection('users', {
      indexes: [customIndex],
    });

    const index = collection.indexes.get('users_data_path_ops');

    assert.strictEqual(
      index?.schemaComponentKey,
      'sc:dumbo:index:custom_jsonb_path:users_data_path_ops',
    );
    assert.deepStrictEqual(index?.path, customIndex.path);
    assert.deepStrictEqual(index?.options, customIndex.options);
    assert.strictEqual(
      typeof collection.indexes.get('users_data_path_ops')?.sql,
      'function',
    );
    expectTypeOf(customIndex.options).toMatchTypeOf<
      PongoCollectionIndexExtensions['custom_jsonb_path']
    >();
  });
});

describe('Pongo collection schema component', () => {
  it('can be used as a strongly typed Dumbo table in mixed schemas', () => {
    type User = { _id: string; email: string };

    const users = pongoSchema.collection<User>('users', {
      schema: 'crm',
      indexes: [pongoSchema.index.unique('users_email_uq', 'email')],
    });
    const accounts = dumboSchema.table('accounts', {
      columns: {
        id: dumboSchema.column('id', SQL.column.type.Varchar('max'), {
          primaryKey: true,
          notNull: true,
        }),
        email: dumboSchema.column('email', SQL.column.type.Varchar('max')),
      },
    });

    const crm = dumboSchema.schema('crm', { accounts, users });

    assert.strictEqual(crm.tables.accounts.tableName, accounts.tableName);
    assert.strictEqual(crm.tables.accounts.databaseSchemaName, 'crm');
    assert.strictEqual(crm.tables.users, users);
    assert.strictEqual(crm.tables.users.tableName, 'users');
    assert.strictEqual(crm.tables.users.tableKind, 'pongo_collection');
    assert.strictEqual(
      users.indexes.get('users_email_uq')?.name,
      'users_email_uq',
    );
    assert.strictEqual(crm.tables.get('users'), users);
    expectTypeOf(crm.tables.users).toMatchTypeOf<
      PongoCollectionSchema<User, string, 'crm'>
    >();
    expectTypeOf(users.document).toEqualTypeOf<User>();
  });
});
