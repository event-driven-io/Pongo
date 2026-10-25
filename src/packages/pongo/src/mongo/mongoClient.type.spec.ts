import type {
  ClientSession,
  ClientSessionOptions,
  MongoDB,
  InsertOneResult,
  WithId,
} from '../shim';
import { describe, expectTypeOf, it } from 'vitest';
import type { Db } from './mongoDb';
import type { MongoClient } from './mongoClient';

type User = { name: string; age?: number };

declare const database: Db;
declare const client: MongoClient;

describe('MongoDB shim types', () => {
  it('exposes the bundled collection contract', () => {
    const collection = database.collection<User>('users');

    expectTypeOf(collection).toExtend<MongoDB.Collection<User>>();
  });

  it('preserves document and identifier inference', () => {
    const collection = database.collection<User>('users');

    expectTypeOf(collection.findOne({ name: 'Alice' })).toEqualTypeOf<
      Promise<WithId<User> | null>
    >();
    expectTypeOf(collection.insertOne({ name: 'Alice' })).toEqualTypeOf<
      Promise<InsertOneResult<User>>
    >();
    expectTypeOf(
      collection.find({ age: { $gte: 18 } }).toArray(),
    ).toEqualTypeOf<Promise<WithId<User>[]>>();
  });

  it('rejects filter and update values with the wrong field type', () => {
    const collection = database.collection<User>('users');

    // @ts-expect-error age filters must use numbers.
    void collection.findOne({ age: { $gte: '18' } });
    // @ts-expect-error name updates must use strings.
    void collection.updateOne({ name: 'Alice' }, { $set: { name: 42 } });
  });

  it('preserves session options and callback types', () => {
    const options: ClientSessionOptions = { defaultTimeoutMS: 100 };

    expectTypeOf(client.startSession(options)).toEqualTypeOf<ClientSession>();
    const result = client.withSession(options, (session) => {
      expectTypeOf(session).toEqualTypeOf<ClientSession>();
      return Promise.resolve('done' as const);
    });
    expectTypeOf(result).toEqualTypeOf<Promise<'done'>>();
  });
});
