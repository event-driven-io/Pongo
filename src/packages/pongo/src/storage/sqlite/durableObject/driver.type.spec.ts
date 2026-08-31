import type {
  DurableObjectStorage,
  SqlStorage,
} from '@cloudflare/workers-types';
import type {
  CloudflareDurableObjectSQLiteClient,
  CloudflareDurableObjectSQLiteConnection,
  CloudflareDurableObjectSQLiteConnectionPool,
  CloudflareDurableObjectSQLiteDriverType,
  CloudflareDurableObjectSQLiteTransactionOptions,
} from '@event-driven-io/dumbo/cloudflare';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  CollectionOperationOptions,
  ExtractPongoDriverOptions,
  PongoSession,
} from '../../../core';
import type { cloudflareDurableObjectSQLiteDriver } from './index';

type DurableObjectSQLitePongoDriverOptions = ExtractPongoDriverOptions<
  typeof cloudflareDurableObjectSQLiteDriver
>;

describe('typing the Cloudflare Durable Object SQLite Pongo driver options', () => {
  it('accepts its concrete client session in collection operations', () => {
    expectTypeOf<
      PongoSession<CloudflareDurableObjectSQLiteDriverType>
    >().toExtend<NonNullable<CollectionOperationOptions['session']>>();
  });

  it('accepts full storage at the top level', () => {
    expectTypeOf<{
      storage: DurableObjectStorage;
    }>().toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('accepts full storage in connection options', () => {
    expectTypeOf<{
      connectionOptions: { storage: DurableObjectStorage };
    }>().toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('accepts a transaction-capable connection', () => {
    expectTypeOf<{
      connectionOptions: {
        connection: CloudflareDurableObjectSQLiteConnection;
      };
    }>().toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('accepts a Cloudflare Durable Object SQLite pool', () => {
    expectTypeOf<{
      pool: CloudflareDurableObjectSQLiteConnectionPool;
    }>().toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('accepts transaction options with storage in either supported shape', () => {
    expectTypeOf<{
      storage: DurableObjectStorage;
      transactionOptions: CloudflareDurableObjectSQLiteTransactionOptions;
    }>().toExtend<DurableObjectSQLitePongoDriverOptions>();

    expectTypeOf<{
      connectionOptions: {
        storage: DurableObjectStorage;
        transactionOptions: CloudflareDurableObjectSQLiteTransactionOptions;
      };
    }>().toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('requires a Durable Object source', () => {
    expectTypeOf<object>().not.toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('rejects conflicting top-level storage and pool sources', () => {
    expectTypeOf<{
      storage: DurableObjectStorage;
      pool: CloudflareDurableObjectSQLiteConnectionPool;
    }>().not.toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('rejects conflicting top-level storage and connection sources', () => {
    expectTypeOf<{
      storage: DurableObjectStorage;
      connectionOptions: {
        connection: CloudflareDurableObjectSQLiteConnection;
      };
    }>().not.toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('rejects top-level storage combined with connection storage', () => {
    expectTypeOf<{
      storage: DurableObjectStorage;
      connectionOptions: { storage: DurableObjectStorage };
    }>().not.toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('rejects conflicting connection option sources', () => {
    expectTypeOf<{
      connectionOptions: {
        storage: DurableObjectStorage;
        connection: CloudflareDurableObjectSQLiteConnection;
      };
    }>().not.toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('rejects a pool combined with connection options', () => {
    expectTypeOf<{
      pool: CloudflareDurableObjectSQLiteConnectionPool;
      connectionOptions: { storage: DurableObjectStorage };
    }>().not.toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('rejects a pool combined with a connection', () => {
    expectTypeOf<{
      pool: CloudflareDurableObjectSQLiteConnectionPool;
      connectionOptions: {
        connection: CloudflareDurableObjectSQLiteConnection;
      };
    }>().not.toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('rejects raw SqlStorage', () => {
    expectTypeOf<{
      storage: SqlStorage;
    }>().not.toExtend<DurableObjectSQLitePongoDriverOptions>();
  });

  it('rejects the raw Dumbo client', () => {
    expectTypeOf<{
      connectionOptions: { client: CloudflareDurableObjectSQLiteClient };
    }>().not.toExtend<DurableObjectSQLitePongoDriverOptions>();
  });
});
