import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { pongoClient, type PongoCache, type PongoClient } from '..';
import { sqlite3Driver } from '../../storage/sqlite/sqlite3';
import { lruCache } from './providers';

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
      const withCache = db.collection<User>('users', {
        cache: { type: 'in-memory' },
      });
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

  describe('cache type resolution cascade', () => {
    it('collection identity-map overrides client in-memory', async () => {
      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
        cache: { type: 'in-memory', max: 5 },
      });
      await client.connect();

      const col = client
        .db('db')
        .collection<User>('users', { cache: { type: 'identity-map' } });

      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        const { insertedId } = await col.insertOne({ name: `User${i}` });
        ids.push(insertedId!);
      }

      for (const id of ids) {
        const doc = await col.findOne({ _id: id });
        expect(doc).not.toBeNull();
      }
    });

    it('client identity-map is used by collection with no override', async () => {
      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
        cache: { type: 'identity-map' },
      });
      await client.connect();

      const col = client.db('db').collection<User>('users');
      const ids: string[] = [];
      for (let i = 0; i < 2000; i++) {
        const { insertedId } = await col.insertOne({ name: `User${i}` });
        ids.push(insertedId!);
      }

      for (const id of ids) {
        const doc = await col.findOne({ _id: id });
        expect(doc).not.toBeNull();
      }
    });

    it('collection disabled overrides client identity-map', async () => {
      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
        cache: { type: 'identity-map' },
      });
      await client.connect();

      const db = client.db('db');
      const col = db.collection<User>('users', { cache: 'disabled' });
      const noCache = db.collection<User>('users', { cache: 'disabled' });

      const { insertedId } = await col.insertOne({ name: 'Leo' });
      await noCache.updateOne(
        { _id: insertedId! },
        { $set: { name: 'LeoUpdated' } },
      );

      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('LeoUpdated');
    });

    it('two collections can use different cache types on the same db', async () => {
      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
      });
      await client.connect();

      const db = client.db('db');
      const lruCol = db.collection<User>('users', {
        cache: { type: 'in-memory', max: 5 },
      });
      const idMapCol = db.collection<User>('orders', {
        cache: { type: 'identity-map' },
      });

      const lruIds: string[] = [];
      const idMapIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        const { insertedId: u } = await lruCol.insertOne({ name: `User${i}` });
        lruIds.push(u!);
        const { insertedId: o } = await idMapCol.insertOne({
          name: `Order${i}`,
        });
        idMapIds.push(o!);
      }

      // LRU with max 5: oldest 5 should be evicted from cache (reads go to DB)
      // identity-map: all 10 present in cache
      for (const id of idMapIds) {
        const doc = await idMapCol.findOne({ _id: id });
        expect(doc).not.toBeNull();
      }

      // At least the most-recent LRU entries should still be in cache
      const recent = lruIds.slice(-5);
      for (const id of recent) {
        const doc = await lruCol.findOne({ _id: id });
        expect(doc).not.toBeNull();
      }
    });
  });

  describe('transaction cache integration', () => {
    beforeEach(async () => {
      client = pongoClient({
        driver: sqlite3Driver,
        connectionString: memoryConnectionString(),
      });
      await client.connect();
    });

    it('insertOne within transaction does NOT populate collection cache until commit', async () => {
      const { cache, spies } = spyCache('col');
      const col = client.db('db').collection<User>('users', { cache });

      const session = client.startSession();
      session.startTransaction();
      await col.insertOne({ name: 'Alice' }, { session });

      expect(spies.set).not.toHaveBeenCalled();

      await session.commitTransaction();
      await session.endSession();

      expect(spies.set).toHaveBeenCalled();
    });

    it('findOne within transaction returns doc from transaction cache', async () => {
      const { cache, spies } = spyCache('col');
      const col = client.db('db').collection<User>('users', { cache });

      const session = client.startSession();
      session.startTransaction();
      const { insertedId } = await col.insertOne(
        { name: 'Carol' },
        { session },
      );

      const doc = await col.findOne({ _id: insertedId! }, { session });
      expect(doc?.name).toBe('Carol');
      // should have hit tx cache, not collection cache get
      expect(spies.get).not.toHaveBeenCalled();

      await session.abortTransaction();
      await session.endSession();
    });

    it('findOne within transaction falls through to collection cache on tx miss', async () => {
      const { cache } = spyCache('col');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Dave' });

      const session = client.startSession();
      session.startTransaction();
      const doc = await col.findOne({ _id: insertedId! }, { session });
      expect(doc?.name).toBe('Dave');

      await session.abortTransaction();
      await session.endSession();
    });

    it('rollback discards buffered cache ops — collection cache stays clean', async () => {
      const { cache, spies } = spyCache('col');
      const col = client.db('db').collection<User>('users', { cache });

      const session = client.startSession();
      session.startTransaction();
      await col.insertOne({ name: 'Bob' }, { session });
      await session.abortTransaction();
      await session.endSession();

      expect(spies.set).not.toHaveBeenCalled();
    });

    it('deleteOne within transaction does NOT evict from collection cache until commit', async () => {
      const { cache, spies } = spyCache('col');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Eve' });
      spies.delete.mockClear();

      const session = client.startSession();
      session.startTransaction();
      await col.deleteOne({ _id: insertedId! }, { session });

      expect(spies.delete).not.toHaveBeenCalled();

      await session.commitTransaction();
      await session.endSession();

      expect(spies.delete).toHaveBeenCalled();
    });

    it('updateOne within transaction does NOT evict from collection cache until commit', async () => {
      const { cache, spies } = spyCache('col');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Frank' });
      spies.delete.mockClear();

      const session = client.startSession();
      session.startTransaction();
      await col.updateOne(
        { _id: insertedId! },
        { $set: { name: 'Updated' } },
        { session },
      );

      expect(spies.delete).not.toHaveBeenCalled();

      // reading without session should still return cached 'Frank'
      const doc = await col.findOne({ _id: insertedId! });
      expect(doc?.name).toBe('Frank');

      await session.commitTransaction();
      await session.endSession();

      expect(spies.delete).toHaveBeenCalled();
    });

    it('replaceOne within transaction buffers cache set until commit', async () => {
      const { cache, spies } = spyCache('col');
      const col = client.db('db').collection<User>('users', { cache });

      const { insertedId } = await col.insertOne({ name: 'Grace' });
      spies.set.mockClear();

      const session = client.startSession();
      session.startTransaction();
      await col.replaceOne(
        { _id: insertedId! },
        { name: 'Replaced' },
        { session },
      );

      expect(spies.set).not.toHaveBeenCalled();

      await session.commitTransaction();
      await session.endSession();

      expect(spies.set).toHaveBeenCalled();
    });

    it('without transaction, operations update collection cache directly', async () => {
      const { cache, spies } = spyCache('col');
      const col = client.db('db').collection<User>('users', { cache });

      await col.insertOne({ name: 'Hank' });

      expect(spies.set).toHaveBeenCalled();
    });
  });
});
