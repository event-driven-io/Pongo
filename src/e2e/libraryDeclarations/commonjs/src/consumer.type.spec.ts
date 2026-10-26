import type {
  AnyDatabaseComponent,
  DatabaseComponent,
  dumboSchema,
} from '@event-driven-io/dumbo';
import type { PgPool } from '@event-driven-io/dumbo/pg';
import type {
  AnyPongoDriver,
  PongoClientOptions,
  PongoCollection,
  PongoCollectionComponent,
  pongoSchema,
  PongoUpdateResult,
  WithIdAndVersion,
} from '@event-driven-io/pongo';
import type { pongoDriver } from '@event-driven-io/pongo/pg';
import type { MongoClient } from '@event-driven-io/pongo/shim';
import type {
  ClientSession,
  MongoDB,
  WithId,
} from '@event-driven-io/pongo/shim';
import type { Pool } from 'pg';
import { describe, expectTypeOf, it } from 'vitest';
import {
  addPoints,
  findUser,
  findUserInTransaction,
  findUsersWithSQL,
  users,
  type User,
} from './client.js';

type Options = PongoClientOptions<typeof pongoDriver>;
type ShimUser = { _id: string; name: string; points: number };
declare const shim: MongoClient;

describe('PostgreSQL package declarations', () => {
  it('accepts the PostgreSQL entry driver through the root API', () => {
    expectTypeOf<typeof pongoDriver>().toExtend<AnyPongoDriver>();
    expectTypeOf<{
      driver: typeof pongoDriver;
      connectionString: string;
    }>().toExtend<Options>();
  });

  it('accepts a Dumbo pool and adopts native pools through connection options', () => {
    expectTypeOf<{
      driver: typeof pongoDriver;
      pool: PgPool;
    }>().toExtend<Options>();
    expectTypeOf<{
      driver: typeof pongoDriver;
      connectionString: string;
      connectionOptions: { pool: Pool };
    }>().toExtend<Options>();
    expectTypeOf<{
      driver: typeof pongoDriver;
      pool: Pool;
    }>().not.toExtend<Options>();
    expectTypeOf<{
      driver: typeof pongoDriver;
      pool: PgPool;
      connectionOptions: { pool: Pool };
    }>().not.toExtend<Options>();
  });

  it('preserves schema collection and query return types', () => {
    expectTypeOf(users).toEqualTypeOf<PongoCollection<User>>();
    expectTypeOf<ReturnType<typeof findUser>>().toEqualTypeOf<
      Promise<WithIdAndVersion<User> | null>
    >();
    expectTypeOf<ReturnType<typeof findUsersWithSQL>>().toEqualTypeOf<
      Promise<WithIdAndVersion<User>[]>
    >();
    expectTypeOf<ReturnType<typeof addPoints>>().toEqualTypeOf<
      Promise<PongoUpdateResult>
    >();
    expectTypeOf<ReturnType<typeof findUserInTransaction>>().toEqualTypeOf<
      Promise<WithIdAndVersion<User> | null>
    >();
  });

  it('rejects filters and updates that do not match the document', () => {
    // @ts-expect-error name is a string
    users.findOne({ name: 123 });
    // @ts-expect-error points is a number
    users.updateOne({ name: 'Alice' }, { $inc: { points: 'one' } });
  });
});

describe('Schema package declarations', () => {
  it('builds database and collection schemas from names', () => {
    expectTypeOf<typeof dumboSchema.database.from>()
      .toBeCallableWith('app', ['public'])
      .returns.toEqualTypeOf<DatabaseComponent>();
    expectTypeOf<typeof pongoSchema.db.from>()
      .toBeCallableWith('app', ['users'])
      .returns.toEqualTypeOf<AnyDatabaseComponent>();
    expectTypeOf<typeof pongoSchema.collection.from>()
      .toBeCallableWith(['users'])
      .returns.toEqualTypeOf<Record<string, PongoCollectionComponent>>();
  });
});

describe('MongoDB shim package declarations', () => {
  it('shares collection and session types with the bundled contract', () => {
    const collection = shim.db('app').collection<ShimUser>('users');
    expectTypeOf(collection).toExtend<MongoDB.Collection<ShimUser>>();
    expectTypeOf(shim.startSession()).toEqualTypeOf<ClientSession>();
    expectTypeOf(collection.findOne({ name: 'Alice' })).toEqualTypeOf<
      Promise<WithId<ShimUser> | null>
    >();
  });

  it('preserves cursor document inference', () => {
    const collection = shim.db('app').collection<ShimUser>('users');
    expectTypeOf(
      collection.find({ points: { $gte: 1 } }).toArray(),
    ).toEqualTypeOf<Promise<WithId<ShimUser>[]>>();
  });

  it('rejects MongoDB filters and updates with invalid field values', () => {
    const collection = shim.db('app').collection<ShimUser>('users');
    // @ts-expect-error name is a string
    collection.findOne({ name: 123 });
    // @ts-expect-error points is a number
    collection.updateOne({ name: 'Alice' }, { $inc: { points: 'one' } });
  });
});
