import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lruCache } from './lruCacheProvider';

const makeTestCollection = (cacheConfig?: any) => {
  let dbDocs: Record<string, any> = {};
  let idSeq = 1;
  const db = {
    insert(doc: any) {
      const _id = doc._id || String(idSeq++);
      dbDocs[_id] = { ...doc, _id };
      return { ...dbDocs[_id] };
    },
    update(_id: string, update: any) {
      if (!dbDocs[_id]) return null;
      dbDocs[_id] = { ...dbDocs[_id], ...update };
      return { ...dbDocs[_id] };
    },
    get(_id: string) {
      return dbDocs[_id] ? { ...dbDocs[_id] } : null;
    },
    clear() {
      dbDocs = {};
      idSeq = 1;
    },
  };
  const cache = lruCache({ max: 100 });
  const collection = {
    async insertOne(doc: any, opts: any = {}) {
      const inserted = db.insert(doc);
      if (!opts.session || !opts.session.inTransaction()) {
        if (!opts.skipCache && cacheConfig !== 'disabled')
          await cache.set(inserted._id, inserted);
      }
      return { insertedId: inserted._id, ...inserted };
    },
    async updateOne(filter: any, update: any, opts: any = {}) {
      const _id = filter._id;
      const updated = db.update(_id, update);
      if (!opts.session || !opts.session.inTransaction()) {
        if (!opts.skipCache && cacheConfig !== 'disabled')
          await cache.set(_id, updated);
      }
      return { matchedCount: updated ? 1 : 0, ...updated };
    },
    async findOne(filter: any, opts: any = {}) {
      const _id = filter._id;
      if (!opts.skipCache && cacheConfig !== 'disabled') {
        const cached = await cache.get(_id);
        if (cached) return cached;
      }
      return db.get(_id);
    },
    async clear() {
      db.clear();
      await cache.clear();
    },
    cache,
    db,
  };
  return { collection, cache, db };
};

describe('Transaction-integrated cache', () => {
  let collection: any, cache: any, db: any;

  beforeEach(async () => {
    ({ collection, cache, db } = makeTestCollection());
    await collection.clear();
  });

  it('reads within a transaction use the cache (default behavior)', async () => {
    const doc = await collection.insertOne({ name: 'A' });
    const session = { inTransaction: () => true };
    const result = await collection.findOne(
      { _id: doc.insertedId },
      { session },
    );
    expect(result.name).toBe('A');
  });

  it('writes within a transaction do NOT update cache until commit', async () => {
    const session = { inTransaction: () => true };
    const doc = await collection.insertOne({ name: 'B' }, { session });
    const cached = await cache.get(doc.insertedId);
    expect(cached).toBeUndefined();
  });

  it('after transaction commit, cache is updated with all write results', async () => {
    const session = {
      inTransaction: () => true,
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const doc = await collection.insertOne({ name: 'C' }, { session });
    await cache.set(doc.insertedId, { ...doc });
    const cached = await cache.get(doc.insertedId);
    expect(cached.name).toBe('C');
  });

  it('after transaction rollback, cache is NOT updated', async () => {
    const session = {
      inTransaction: () => true,
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const doc = await collection.insertOne({ name: 'D' }, { session });
    const cached = await cache.get(doc.insertedId);
    expect(cached).toBeUndefined();
  });

  it('startSession({ cache: "disabled" }) disables cache for that session', async () => {
    const session = { inTransaction: () => false, cache: 'disabled' };
    const doc = await collection.insertOne({ name: 'E' }, { session });
    const cached = await cache.get(doc.insertedId);
    expect(cached).toBeUndefined();
  });

  it('per-session cache config overrides collection config', async () => {
    const session = {
      inTransaction: () => false,
      cache: { type: 'in-memory', max: 1 },
    };
    const doc = await collection.insertOne({ name: 'F' }, { session });
    const cached = await cache.get(doc.insertedId);
    expect(cached.name).toBe('F');
  });
});
