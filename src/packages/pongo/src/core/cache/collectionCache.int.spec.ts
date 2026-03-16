import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pongoClient, type PongoClient } from '..';
import { sqlite3Driver } from '../../storage/sqlite/sqlite3';
import { pongoCacheWrapper } from './cacheWrapper';
import { inMemoryCacheProvider } from './inMemoryProvider';
import type { PongoCacheProvider } from './types';

type User = { _id?: string; name: string; age?: number };

const makeTrackedCache = (
  dbName: string,
  collectionName: string,
): { cache: PongoCacheProvider; raw: PongoCacheProvider } => {
  const backing = inMemoryCacheProvider({ max: 100 });
  const cache = pongoCacheWrapper({ provider: backing, dbName, collectionName });
  const raw = pongoCacheWrapper({ provider: backing, dbName, collectionName });
  return { cache, raw };
};

describe('pongoCollection cache integration', () => {
  let client: PongoClient;

  beforeEach(async () => {
    client = pongoClient({
      driver: sqlite3Driver,
      connectionString: `file::memory:?cache=shared&_${Math.random()}`,
    });
    await client.connect();
  });

  afterEach(async () => {
    await client.close();
  });

  describe('findOne', () => {
    it('cache miss → queries DB, populates cache, returns document', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne(
        { name: 'Alice' },
        { skipCache: true },
      );

      expect(await raw.get(insertedId!)).toBeUndefined();

      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('Alice');

      const cached = await raw.get(insertedId!);
      expect((cached as Record<string, unknown>)?.name).toBe('Alice');
    });

    it('cache hit → returns cached document without hitting DB', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Bob' });
      await cache.set(insertedId!, { _id: insertedId!, name: 'CachedBob', _version: 1n });

      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('CachedBob');
    });

    it('skipCache: true → always queries DB', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Carol' });
      await cache.set(insertedId!, { _id: insertedId!, name: 'Poisoned', _version: 1n });

      const doc = await col.findOne({ _id: insertedId! }, { skipCache: true });
      expect(doc?.name).toBe('Carol');
    });

    it('non-_id filter → bypasses cache, queries DB', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      await col.insertOne({ name: 'Dave' });

      const getSpy = vi.spyOn(cache, 'get');
      const doc = await col.findOne({ name: 'Dave' } as unknown as { _id: string });
      expect(doc?.name).toBe('Dave');
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('second findOne by _id returns cached version', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Eve' });
      await col.findOne({ _id: insertedId! });
      await cache.set(insertedId!, { _id: insertedId!, name: 'CachedEve', _version: 1n });

      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('CachedEve');
    });
  });

  describe('insertOne', () => {
    it('after insertOne the document is in the cache', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Frank' });
      const cached = await raw.get(insertedId!);
      expect((cached as Record<string, unknown>)?.name).toBe('Frank');
    });

    it('findOne after insertOne returns from cache', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Grace' });
      await cache.set(insertedId!, { _id: insertedId!, name: 'CachedGrace', _version: 1n });

      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('CachedGrace');
    });
  });

  describe('insertMany', () => {
    it('after insertMany all documents are in the cache', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const result = await col.insertMany([
        { name: 'H1' },
        { name: 'H2' },
        { name: 'H3' },
      ]);
      expect(result.insertedIds).toHaveLength(3);

      for (const id of result.insertedIds) {
        expect(await raw.get(id)).toBeDefined();
      }
    });
  });

  describe('updateOne', () => {
    it('after updateOne the stale cache entry is evicted', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Ivan', age: 30 });
      expect(await raw.get(insertedId!)).toBeDefined();

      await col.updateOne({ _id: insertedId! }, { $set: { age: 31 } });
      expect(await raw.get(insertedId!)).toBeUndefined();
    });

    it('after updateOne + findOne the cache contains the updated value', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Jane', age: 25 });
      await col.updateOne({ _id: insertedId! }, { $set: { age: 26 } });

      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.age).toBe(26);
    });
  });

  describe('replaceOne', () => {
    it('after replaceOne the cache is updated with the new document state', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Karl', age: 40 });
      await col.replaceOne({ _id: insertedId! }, { name: 'Karl Updated', age: 41 });

      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('Karl Updated');
      expect(doc?.age).toBe(41);
    });
  });

  describe('deleteOne', () => {
    it('after deleteOne the document is evicted from cache', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Laura' });
      expect(await raw.get(insertedId!)).toBeDefined();

      await col.deleteOne({ _id: insertedId! });
      expect(await raw.get(insertedId!)).toBeUndefined();
    });

    it('findOne after deleteOne returns null', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Mike' });
      await col.deleteOne({ _id: insertedId! });

      expect(await col.findOne({ _id: insertedId! })).toBeNull();
    });
  });

  describe('deleteMany', () => {
    it('deleteMany with $in filter evicts those ids from cache', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const r1 = await col.insertOne({ name: 'N1' });
      const r2 = await col.insertOne({ name: 'N2' });
      const r3 = await col.insertOne({ name: 'N3' });

      await col.deleteMany({
        _id: { $in: [r1.insertedId!, r2.insertedId!] },
      } as unknown as { _id: string });

      expect(await raw.get(r1.insertedId!)).toBeUndefined();
      expect(await raw.get(r2.insertedId!)).toBeUndefined();
      expect(await raw.get(r3.insertedId!)).toBeDefined();
    });

    it('deleteMany with non-id filter does not evict from cache', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Oscar', age: 99 });
      await col.deleteMany({ age: 99 } as unknown as { _id: string });

      expect(await raw.get(insertedId!)).toBeDefined();
    });
  });

  describe('find with $in filter', () => {
    it('returns cached docs for hits, queries DB for misses, populates cache', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const r1 = await col.insertOne({ name: 'P1' });
      const r2 = await col.insertOne({ name: 'P2' });
      const r3 = await col.insertOne({ name: 'P3' });

      await raw.delete(r2.insertedId!);

      const docs = await col.find({
        _id: { $in: [r1.insertedId!, r2.insertedId!, r3.insertedId!] },
      } as unknown as { _id: string });

      expect(docs).toHaveLength(3);
      expect(docs.map((d) => d.name).sort()).toEqual(['P1', 'P2', 'P3']);
      expect(await raw.get(r2.insertedId!)).toBeDefined();
    });

    it('find with non-_id filter bypasses cache', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      await col.insertOne({ name: 'Q1', age: 50 });
      const getManyspy = vi.spyOn(cache, 'getMany');

      await col.find({ age: 50 } as unknown as { _id: string });
      expect(getManyspy).not.toHaveBeenCalled();
    });

    it('find with skipCache bypasses cache', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'R1' });
      const getManyspy = vi.spyOn(cache, 'getMany');

      await col.find(
        { _id: { $in: [insertedId!] } } as unknown as { _id: string },
        { skipCache: true },
      );
      expect(getManyspy).not.toHaveBeenCalled();
    });
  });

  describe('handle', () => {
    it('reads from cache on cache hit', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Sam' });
      await cache.set(insertedId!, { _id: insertedId!, name: 'CachedSam', _version: 1n });

      const seen = { doc: null as User | null };
      await col.handle(insertedId!, (doc) => {
        seen.doc = doc as User | null;
        return doc;
      });

      expect(seen.doc?.name).toBe('CachedSam');
    });

    it('after handle inserts a new document, it is in the cache', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const newId = 'handle-insert-id';
      await col.handle(newId, () => ({ name: 'NewViaHandle' }));

      const cached = await raw.get(newId);
      expect((cached as Record<string, unknown>)?.name).toBe('NewViaHandle');
    });

    it('after handle updates a document, cache is updated', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Tina', age: 20 });
      await col.handle(insertedId!, (doc) => (doc ? { ...doc, age: 21 } : null));

      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.age).toBe(21);
    });

    it('after handle deletes a document, cache is evicted', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Uma' });
      expect(await raw.get(insertedId!)).toBeDefined();

      await col.handle(insertedId!, () => null);
      expect(await raw.get(insertedId!)).toBeUndefined();
    });

    it('skipCache: true bypasses cache read in handle', async () => {
      const { cache } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Vera' });
      await cache.set(insertedId!, { _id: insertedId!, name: 'Poisoned', _version: 1n });

      const seen = { doc: null as User | null };
      await col.handle(
        insertedId!,
        (doc) => {
          seen.doc = doc as User | null;
          return doc;
        },
        { skipCache: true },
      );

      expect(seen.doc?.name).toBe('Vera');
    });
  });

  describe('cache disabled', () => {
    it('operations work normally without caching', async () => {
      const col = client.db('db').collection<User>('users', { cache: 'disabled' });

      const { insertedId } = await col.insertOne({ name: 'Walter' });
      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('Walter');
    });
  });

  describe('updateMany', () => {
    it('updateMany does not interact with cache (known limitation: stale entries remain)', async () => {
      const { cache, raw } = makeTrackedCache('db', 'users');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Xavier', age: 10 });
      await col.updateMany(
        { age: 10 } as unknown as { _id: string },
        { $set: { age: 11 } },
      );

      const cached = await raw.get(insertedId!);
      expect((cached as Record<string, unknown>)?.age).toBe(10);
    });
  });
});
