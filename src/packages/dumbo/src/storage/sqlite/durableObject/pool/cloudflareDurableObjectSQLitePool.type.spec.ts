import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { describe, expectTypeOf, it } from 'vitest';
import type { CloudflareDurableObjectSQLiteClient } from '../connections';
import type { CloudflareDurableObjectSQLiteConnection } from '../connections/cloudflareDurableObjectSQLiteConnection';
import type { CloudflareDurableObjectSQLitePoolOptions } from './cloudflareDurableObjectSQLitePool';

describe('typing Cloudflare Durable Object SQLite pool sources', () => {
  it('requires exactly one storage, client, or connection source', () => {
    expectTypeOf<{
      storage: DurableObjectStorage;
    }>().toExtend<CloudflareDurableObjectSQLitePoolOptions>();
    expectTypeOf<{
      client: CloudflareDurableObjectSQLiteClient;
    }>().toExtend<CloudflareDurableObjectSQLitePoolOptions>();
    expectTypeOf<{
      connection: CloudflareDurableObjectSQLiteConnection;
    }>().toExtend<CloudflareDurableObjectSQLitePoolOptions>();
    expectTypeOf<object>().not.toExtend<CloudflareDurableObjectSQLitePoolOptions>();
  });

  it('rejects every pair of conflicting sources', () => {
    expectTypeOf<{
      storage: DurableObjectStorage;
      client: CloudflareDurableObjectSQLiteClient;
    }>().not.toExtend<CloudflareDurableObjectSQLitePoolOptions>();
    expectTypeOf<{
      storage: DurableObjectStorage;
      connection: CloudflareDurableObjectSQLiteConnection;
    }>().not.toExtend<CloudflareDurableObjectSQLitePoolOptions>();
    expectTypeOf<{
      client: CloudflareDurableObjectSQLiteClient;
      connection: CloudflareDurableObjectSQLiteConnection;
    }>().not.toExtend<CloudflareDurableObjectSQLitePoolOptions>();
  });
});
