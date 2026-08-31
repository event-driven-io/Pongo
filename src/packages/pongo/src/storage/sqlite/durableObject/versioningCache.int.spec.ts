import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import { aroundEach, describe, expect, it } from 'vitest';
import { pongoClient, type PongoClient, type PongoDb } from '../../..';
import { cloudflareDurableObjectSQLiteDriver } from '.';

type StoredPayload = { n: number };
type Domain = { value: number };

const upcast = (doc: StoredPayload): Domain => ({ value: doc.n });
const downcast = (doc: Domain): StoredPayload => ({ n: doc.value });

describe('versioned collection: id reads, handle and replaceMany keep working', () => {
  let client: PongoClient;
  let db: PongoDb;

  aroundEach(async (runTest) => {
    const stub = env.TEST_OBJECT.get(env.TEST_OBJECT.newUniqueId());

    await runInDurableObject(stub, async (_instance, state) => {
      client = pongoClient({
        driver: cloudflareDurableObjectSQLiteDriver,
        storage: state.storage,
      });
      await client.connect();
      db = client.db('db');

      try {
        await runTest();
      } finally {
        await client.close();
      }
    });
  });

  const versioned = (name: string, cache?: { type: 'identity-map' }) =>
    db.collection<Domain, StoredPayload>(name, {
      schema: { versioning: { upcast, downcast } },
      ...(cache ? { cache } : {}),
    });

  it('find by _id with $in returns the versioned document', async () => {
    const col = versioned('find_in');
    const { insertedId } = await col.insertOne({ value: 7 });

    const found = await col.find({ _id: { $in: [insertedId!] } });

    expect(found).toHaveLength(1);
    expect(found[0]?.value).toBe(7);
  });

  it('handle loads the existing document instead of treating it as new', async () => {
    const col = versioned('handle_existing');
    const { insertedId } = await col.insertOne({ value: 1 });

    let received: Domain | null = null;
    const result = await col.handle(insertedId!, (existing) => {
      received = existing;
      return { value: 2 };
    });

    expect(received).toMatchObject({ value: 1 });
    expect(result.successful).toBe(true);

    const updated = await col.findOne({ _id: insertedId! });
    expect(updated?.value).toBe(2);

    const second = await col.handle(insertedId!, (existing) => ({
      value: (existing?.value ?? 0) + 1,
    }));
    expect(second.successful).toBe(true);
    const updatedAgain = await col.findOne({ _id: insertedId! });
    expect(updatedAgain?.value).toBe(3);
  });

  it('replaceMany updates a versioned document by _id', async () => {
    const col = versioned('replace_many');
    const { insertedId } = await col.insertOne({ value: 1 });

    const result = await col.replaceMany([{ _id: insertedId!, value: 9 }]);

    expect(result.successful).toBe(true);
    const doc = await col.findOne({ _id: insertedId! });
    expect(doc?.value).toBe(9);
  });

  it('handle enforces optimistic concurrency via the stored version', async () => {
    const col = versioned('handle_occ');
    const { insertedId } = await col.insertOne({ value: 1 });

    const ok = await col.handle(
      { _id: insertedId!, expectedVersion: 1n },
      () => ({ value: 2 }),
    );
    expect(ok.successful).toBe(true);

    const stale = await col.handle(
      { _id: insertedId!, expectedVersion: 1n },
      () => ({ value: 3 }),
    );
    expect(stale.successful).toBe(false);

    const doc = await col.findOne({ _id: insertedId! });
    expect(doc?.value).toBe(2);
  });

  it('passes the upcast read model with id and version to the handle callback', async () => {
    const col = versioned('handle_pure');
    const { insertedId } = await col.insertOne({ value: 4 });

    let received: (Domain & { _id?: string; _version?: bigint }) | null = null;
    await col.handle(insertedId!, (existing) => {
      received = existing;
      return existing;
    });

    expect(received).toEqual({ value: 4, _id: insertedId, _version: 1n });
  });

  it('serves a correct upcast value from the document cache on the second read', async () => {
    const col = versioned('cache_read', { type: 'identity-map' });
    const { insertedId } = await col.insertOne({ value: 6 });

    const first = await col.findOne({ _id: insertedId! });
    expect(first?.value).toBe(6);

    const second = await col.findOne({ _id: insertedId! });
    expect(second?.value).toBe(6);

    const viaIn = await col.find({ _id: { $in: [insertedId!] } });
    expect(viaIn[0]?.value).toBe(6);
  });
});
