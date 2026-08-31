import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { describe, expectTypeOf, it } from 'vitest';
import type { JSONSerializer } from '../../../../core';
import type {
  CloudflareDurableObjectSQLiteClient,
  CloudflareDurableObjectSQLiteConnectionOptions,
} from './cloudflareDurableObjectSQLiteConnection';

describe('typing Cloudflare Durable Object SQLite connection sources', () => {
  it('accepts exactly one storage or client source', () => {
    expectTypeOf<{
      storage: DurableObjectStorage;
      serializer: JSONSerializer;
    }>().toExtend<CloudflareDurableObjectSQLiteConnectionOptions>();
    expectTypeOf<{
      client: CloudflareDurableObjectSQLiteClient;
      serializer: JSONSerializer;
    }>().toExtend<CloudflareDurableObjectSQLiteConnectionOptions>();
  });

  it('rejects missing and conflicting sources', () => {
    expectTypeOf<{
      serializer: JSONSerializer;
    }>().not.toExtend<CloudflareDurableObjectSQLiteConnectionOptions>();
    expectTypeOf<{
      storage: DurableObjectStorage;
      client: CloudflareDurableObjectSQLiteClient;
      serializer: JSONSerializer;
    }>().not.toExtend<CloudflareDurableObjectSQLiteConnectionOptions>();
  });
});
