import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { pongoClient, type PongoClient } from '..';
import { sqlite3Driver } from '../../storage/sqlite/sqlite3';
import { lruCache } from './providers/lruCache';
import type { PongoCache } from './types';

type User = { _id?: string; name: string; age?: number };

const spyCache = (
  _label: string,
): { cache: PongoCache; spies: { get: Mock; set: Mock; delete: Mock } } => {
  const raw = lruCache({ max: 100 });
  const spies = {
    get: vi.fn(raw.get.bind(raw)),
    set: vi.fn(raw.set.bind(raw)),
    delete: vi.fn(raw.delete.bind(raw)),
  };
  return {
    cache: { ...raw, ...spies } as PongoCache,
    spies,
  };
};

const memoryConnectionString = () =>
  `file::memory:?cache=shared&_${Math.random()}`;

describe('pongoCollection cache integration', () => {
  let client: PongoClient;

  afterEach(async () => {
    await client.close();
  });

  describe('cache config cascade', () => {
    it('client-level cache flows to collection', async () => {
      const { cache, spies } = spyCache('client');
      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
        cache,
      });
      await client.connect();

      const col = client.db('db').collection<User>('users');
      const { insertedId } = await col.insertOne({ name: 'Alice' });
      await col.findOne({ _id: insertedId! });

      expect(spies.set).toHaveBeenCalled();
      expect(spies.get).toHaveBeenCalled();
    });

    it('collection-level cache overrides client-level', async () => {
      const { cache: clientCache, spies: clientSpies } = spyCache('client');
      const { cache: colCache, spies: colSpies } = spyCache('collection');

      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
        cache: clientCache,
      });
      await client.connect();

      const col = client
        .db('db')
        .collection<User>('users', { cache: colCache });
      const { insertedId } = await col.insertOne({ name: 'Bob' });
      await col.findOne({ _id: insertedId! });

      expect(colSpies.set).toHaveBeenCalled();
      expect(colSpies.get).toHaveBeenCalled();
      expect(clientSpies.set).not.toHaveBeenCalled();
      expect(clientSpies.get).not.toHaveBeenCalled();
    });

    it("'disabled' at client, enabled at collection", async () => {
      const { cache: colCache, spies: colSpies } = spyCache('collection');

      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
        cache: 'disabled',
      });
      await client.connect();

      const col = client
        .db('db')
        .collection<User>('users', { cache: colCache });
      const { insertedId } = await col.insertOne({ name: 'Carol' });
      await col.findOne({ _id: insertedId! });

      expect(colSpies.set).toHaveBeenCalled();
    });

    it("client cache active, 'disabled' at collection", async () => {
      const { cache: clientCache, spies: clientSpies } = spyCache('client');

      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
        cache: clientCache,
      });
      await client.connect();

      const db = client.db('db');
      const cached = db.collection<User>('users', { cache: 'disabled' });
      const uncached = db.collection<User>('users', { cache: 'disabled' });

      const { insertedId } = await cached.insertOne({ name: 'Dave' });
      await uncached.updateOne(
        { _id: insertedId! },
        { $set: { name: 'DaveUpdated' } },
      );

      const doc = await cached.findOne({ _id: insertedId! });

      expect(clientSpies.get).not.toHaveBeenCalled();
      expect(doc?.name).toBe('DaveUpdated');
    });

    it('skipCache: true bypasses cache', async () => {
      const { cache, spies } = spyCache('client');

      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
        cache,
      });
      await client.connect();

      const col = client.db('db').collection<User>('users');
      const { insertedId } = await col.insertOne({ name: 'Eve' });
      await col.findOne({ _id: insertedId! }, { skipCache: true });

      expect(spies.get).not.toHaveBeenCalled();
    });
  });

  describe('behavioral cache correctness', () => {
    beforeEach(async () => {
      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
      });
      await client.connect();
    });

    const makeCollectionPair = (c: PongoClient) => {
      const db = c.db('db');
      const withCache = db.collection<User>('users');
      const noCache = db.collection<User>('users', { cache: 'disabled' });
      return { withCache, noCache };
    };

    it('findOne by _id returns cached (stale) document', async () => {
      const { withCache, noCache } = makeCollectionPair(client);

      const { insertedId } = await withCache.insertOne({ name: 'Frank' });
      await noCache.updateOne(
        { _id: insertedId! },
        { $set: { name: 'FrankUpdated' } },
      );

      const doc = await withCache.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('Frank');
    });

    it('findOne with non-_id filter bypasses cache', async () => {
      const { withCache, noCache } = makeCollectionPair(client);

      const { insertedId } = await withCache.insertOne({ name: 'Grace' });
      await noCache.updateOne(
        { _id: insertedId! },
        { $set: { name: 'GraceUpdated' } },
      );

      const doc = await withCache.findOne({
        name: 'GraceUpdated',
      } as unknown as { _id: string });
      expect(doc?.name).toBe('GraceUpdated');
    });

    it('insertOne populates cache', async () => {
      const { withCache, noCache } = makeCollectionPair(client);

      const { insertedId } = await withCache.insertOne({ name: 'Hank' });
      await noCache.updateOne(
        { _id: insertedId! },
        { $set: { name: 'HankUpdated' } },
      );

      const doc = await withCache.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('Hank');
    });

    it('updateOne evicts from cache', async () => {
      const { withCache } = makeCollectionPair(client);

      const { insertedId } = await withCache.insertOne({
        name: 'Ivan',
        age: 30,
      });
      await withCache.findOne({ _id: insertedId! });
      await withCache.updateOne({ _id: insertedId! }, { $set: { age: 31 } });

      const doc = await withCache.findOne({ _id: insertedId! });
      expect(doc?.age).toBe(31);
    });

    it('deleteOne evicts from cache', async () => {
      const { withCache } = makeCollectionPair(client);

      const { insertedId } = await withCache.insertOne({ name: 'Jane' });
      await withCache.deleteOne({ _id: insertedId! });

      expect(await withCache.findOne({ _id: insertedId! })).toBeNull();
    });

    it('default behavior (no cache config) works', async () => {
      const col = client.db('db').collection<User>('users');

      const { insertedId } = await col.insertOne({ name: 'Karl' });
      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('Karl');
    });
  });
});
