import assert from 'node:assert';
import { SQL } from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import {
  pongoSchema,
  type PongoCollectionIndex,
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

    assert.deepStrictEqual(email, {
      name: 'users_email_idx',
      path: 'email',
      unique: undefined,
      type: 'json_path',
    });
    assert.deepStrictEqual(externalId, {
      name: 'users_external_id_uq',
      path: ['external', 'id'],
      unique: true,
      type: 'json_path',
    });
    assert.deepStrictEqual(document, {
      name: 'users_data_idx',
      type: 'json_document',
    });
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
    } satisfies PongoCollectionIndex<'custom_jsonb_path'>;

    const collection = pongoSchema.collection('users', {
      indexes: [customIndex],
    });

    assert.strictEqual(collection.indexes?.[0], customIndex);
    assert.strictEqual(typeof collection.indexes?.[0]?.sql, 'function');
    expectTypeOf(customIndex.options).toMatchTypeOf<
      PongoCollectionIndexExtensions['custom_jsonb_path']
    >();
  });
});
