import { PostgreSQLConnectionString } from '@event-driven-io/dumbo/pg';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import console from 'console';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  ObjectId,
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoCollection,
  type PongoDb,
  type WithId,
} from '../../../';
import { pongoDriver } from '../../../pg';

type User = {
  _id?: string;
  name: string;
  age: number;
  _version?: bigint;
};

describe('Upsert Operations (native API)', () => {
  let postgres: StartedPostgreSqlContainer;
  let postgresConnectionString: PostgreSQLConnectionString;
  let client: PongoClient;

  let pongoDb: PongoDb;
  let users: PongoCollection<User>;

  let user: User;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    postgresConnectionString = PostgreSQLConnectionString(
      postgres.getConnectionUri(),
    );

    const dbName = postgres.getDatabase();

    client = pongoClient({
      driver: pongoDriver,
      connectionString: postgresConnectionString,
      schema: {
        autoMigration: 'CreateOrUpdate',
        definition: pongoSchema.client({
          database: pongoSchema.db(dbName, {
            users: pongoSchema.collection<User>('users'),
          }),
        }),
      },
    });
    await client.connect();

    pongoDb = client.db(dbName);
    await pongoDb.schema.migrate();
    users = pongoDb.collection<User>('users');
  });

  beforeEach(() => {
    user = {
      _id: ObjectId(),
      name: 'Anita',
      age: 25,
    };
  });

  afterAll(async () => {
    try {
      await client.close();
      await postgres.stop();
    } catch (error) {
      console.log(error);
    }
  });

  describe('insertOne with upsert', () => {
    it('inserts a new document at version 1', async () => {
      const result = await users.insertOne(user, { upsert: true });

      assert(result.successful);
      assert(result.insertedId === user._id);
      assert(result.nextExpectedVersion === 1n);

      const doc = await users.findOne({ _id: user._id });
      assert.deepStrictEqual(doc, { ...user, _version: 1n });
    });

    it('replaces an existing document and bumps the version', async () => {
      await users.insertOne(user);

      const replacement = { ...user, name: 'Cruella', age: 40 };
      const result = await users.insertOne(replacement, { upsert: true });

      assert(result.successful);
      assert(result.insertedId === user._id);
      assert(result.nextExpectedVersion === 2n);

      const doc = await users.findOne({ _id: user._id });
      assert.deepStrictEqual(doc, { ...replacement, _version: 2n });
    });
  });

  describe('insertMany with upsert', () => {
    it('inserts new and replaces existing in one call without duplicates', async () => {
      const existing = { ...user, _id: ObjectId() };
      await users.insertOne(existing);

      const newDoc = { ...user, _id: ObjectId(), name: 'New', age: 20 };
      const existingReplacement = { ...existing, name: 'Updated', age: 99 };

      const result = await users.insertMany([newDoc, existingReplacement], {
        upsert: true,
      });

      assert(result.successful);
      assert(result.insertedCount === 2);
      assert(result.insertedIds.includes(newDoc._id));
      assert(result.insertedIds.includes(existing._id));

      const newlyInserted = await users.findOne({ _id: newDoc._id });
      assert.deepStrictEqual(newlyInserted, { ...newDoc, _version: 1n });

      const replaced = await users.findOne({ _id: existing._id });
      assert.deepStrictEqual(replaced, {
        ...existingReplacement,
        _version: 2n,
      });

      const all = await users.find({
        _id: { $in: [newDoc._id, existing._id] },
      });
      assert(all.length === 2);
    });
  });

  describe('replaceOne with upsert and NO expectedVersion', () => {
    it('inserts when the document is absent', async () => {
      const id = ObjectId();
      const doc = { name: 'Ghost', age: 33 };

      const result = await users.replaceOne({ _id: id }, doc, {
        upsert: true,
      });

      assert(result.successful);
      assert(result.matchedCount === 0);
      assert(result.modifiedCount === 0);
      assert(result.upsertedCount === 1);
      assert(result.upsertedId === id);
      assert(result.nextExpectedVersion === 1n);

      const stored = await users.findOne({ _id: id });
      assert.deepStrictEqual(stored, { ...doc, _id: id, _version: 1n });
    });

    it('replaces and bumps the version when the document is present', async () => {
      await users.insertOne(user);

      const result = await users.replaceOne(
        { _id: user._id! },
        { name: user.name, age: 31 },
        { upsert: true },
      );

      assert(result.successful);
      assert(result.matchedCount === 1);
      assert(result.modifiedCount === 1);
      assert(result.upsertedCount === 0);
      assert(result.upsertedId === null);

      const doc = await users.findOne({ _id: user._id! });
      assert.deepStrictEqual(doc, {
        _id: user._id,
        name: user.name,
        age: 31,
        _version: 2n,
      });
    });
  });

  describe('replaceOne with upsert and expectedVersion (version check governs)', () => {
    it('conflicts and does NOT insert when the document is absent', async () => {
      const id = ObjectId();

      const result = await users.replaceOne(
        { _id: id },
        { name: 'Ghost', age: 33 },
        { upsert: true, expectedVersion: 1n },
      );

      assert(result.successful === false);

      const stored = await users.findOne({ _id: id });
      assert(stored === null);
    });

    it('conflicts and leaves the row untouched when expectedVersion is wrong', async () => {
      await users.insertOne(user);

      const result = await users.replaceOne(
        { _id: user._id! },
        { name: 'Cruella', age: 40 },
        { upsert: true, expectedVersion: 999n },
      );

      assert(result.successful === false);

      const doc = await users.findOne({ _id: user._id! });
      assert.deepStrictEqual(doc, { ...user, _version: 1n });

      const all = await users.find({ _id: user._id! });
      assert(all.length === 1);
    });

    it('replaces when expectedVersion matches', async () => {
      await users.insertOne(user);

      const result = await users.replaceOne(
        { _id: user._id! },
        { name: user.name, age: 31 },
        { upsert: true, expectedVersion: 1n },
      );

      assert(result.successful);

      const doc = await users.findOne({ _id: user._id! });
      assert.deepStrictEqual(doc, {
        _id: user._id,
        name: user.name,
        age: 31,
        _version: 2n,
      });
    });
  });

  describe('replaceMany with upsert', () => {
    it('writes a versionless batch mixing new and existing without duplicates', async () => {
      const existing = { ...user, _id: ObjectId() };
      await users.insertOne(existing);

      const newId = ObjectId();
      const docs: Array<WithId<User>> = [
        { _id: existing._id, name: 'Updated', age: 30 },
        { _id: newId, name: 'Fresh', age: 21 },
      ];

      const result = await users.replaceMany(docs, { upsert: true });

      assert(result.successful);
      assert(result.modifiedIds.includes(existing._id));
      assert(result.modifiedIds.includes(newId));
      assert(result.conflictIds.length === 0);

      const updated = await users.findOne({ _id: existing._id });
      assert.strictEqual(updated?.name, 'Updated');

      const fresh = await users.findOne({ _id: newId });
      assert.strictEqual(fresh?.name, 'Fresh');

      const all = await users.find({ _id: { $in: [existing._id, newId] } });
      assert(all.length === 2);
    });

    it('throws when the batch mixes versioned and versionless documents', async () => {
      const existing = { ...user, _id: ObjectId() };
      await users.insertOne(existing);

      const mixed = [
        { _id: existing._id, name: 'Versioned', age: 30, _version: 1n },
        { _id: ObjectId(), name: 'Versionless', age: 21 },
      ] as unknown as Array<WithId<User>>;

      await assert.rejects(() => users.replaceMany(mixed, { upsert: true }));
    });
  });
});
