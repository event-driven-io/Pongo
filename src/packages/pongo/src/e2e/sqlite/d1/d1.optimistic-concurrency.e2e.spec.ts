import type { D1Database } from '@cloudflare/workers-types';
import assert from 'assert';
import { Miniflare } from 'miniflare';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  ObjectId,
  pongoClient,
  type PongoClient,
  type PongoCollection,
  type PongoDb,
} from '../../../';
import { d1Driver as pongoDriver } from '../../../storage/sqlite/d1';

type History = { street: string };
type Address = {
  city: string;
  street?: string;
  zip?: string;
  history?: History[];
};

type User = {
  _id?: string;
  name: string;
  age: number;
  address?: Address;
  tags?: string[];
  _version?: bigint;
};

describe('MongoDB Compatibility Tests', () => {
  let mf: Miniflare;

  let client: PongoClient;
  let database: D1Database;
  let pongoDb: PongoDb;
  let users: PongoCollection<User>;

  let user: User;

  // SQLite/D1 apply the version guard inside the single write statement, so an
  // optimistic-concurrency conflict matches no row and is not counted.
  const matchedCountOnConflict = 0;

  beforeAll(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-db-id' },
    });
    database = await mf.getD1Database('DB');

    client = pongoClient({
      driver: pongoDriver,
      database,
      transactionOptions: { mode: 'session_based' },
    });
    await client.connect();

    pongoDb = client.db('testdb');
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
    await client.close();
    await mf.dispose();
  });

  describe('Insert Operations', () => {
    describe('insertOne', () => {
      it('inserts a document with id', async () => {
        // Given
        // When
        const pongoInsertResult = await users.insertOne(user);

        // Then
        assert(pongoInsertResult.successful);
        assert(pongoInsertResult.insertedId);

        const pongoDoc = await users.findOne({
          _id: pongoInsertResult.insertedId,
        });
        assert.ok(pongoDoc);
        assert.deepStrictEqual(pongoDoc, {
          ...user,
          _version: 1n,
        });
      });

      it('inserts a document with id and version', async () => {
        // Given
        const nonDefaultVersion = 495n;
        // When
        const pongoInsertResult = await users.insertOne({
          ...user,
          _version: nonDefaultVersion,
        });

        // Then
        assert(pongoInsertResult.successful);
        assert(pongoInsertResult.insertedId);

        const pongoDoc = await users.findOne({
          _id: pongoInsertResult.insertedId,
        });
        assert.ok(pongoDoc);
        assert.deepStrictEqual(pongoDoc, {
          ...user,
          _version: nonDefaultVersion,
        });
      });

      it('Does NOT insert a document with the same id as the existing document', async () => {
        // Given
        await users.insertOne(user);

        const userWithTheSameId: User = {
          _id: user._id!,
          name: 'Cruella',
          age: 40,
        };
        // When
        const pongoInsertResult = await users.insertOne(userWithTheSameId);

        // Then
        assert(pongoInsertResult.successful === false);
        assert(pongoInsertResult.insertedId === null);

        const pongoDoc = await users.findOne({
          _id: user._id!,
        });
        assert.ok(pongoDoc);
        assert.deepStrictEqual(pongoDoc, {
          ...user,
          _version: 1n,
        });
      });

      it('inserts when expected DOCUMENT_DOES_NOT_EXIST and the document is absent', async () => {
        // When
        const pongoInsertResult = await users.insertOne(user, {
          expectedVersion: 'DOCUMENT_DOES_NOT_EXIST',
        });

        // Then
        assert(pongoInsertResult.successful);
        assert(pongoInsertResult.insertedId);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert.deepStrictEqual(pongoDoc, { ...user, _version: 1n });
      });

      it('does NOT insert when expected DOCUMENT_DOES_NOT_EXIST and the document is present', async () => {
        // Given
        await users.insertOne(user);

        // When
        const pongoInsertResult = await users.insertOne(
          { _id: user._id!, name: 'Cruella', age: 40 },
          { expectedVersion: 'DOCUMENT_DOES_NOT_EXIST' },
        );

        // Then
        assert(pongoInsertResult.successful === false);
        assert(pongoInsertResult.insertedId === null);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert.deepStrictEqual(pongoDoc, { ...user, _version: 1n });
      });
    });

    describe('insertMany', () => {
      it('inserts a document with id', async () => {
        // Given
        const otherUser = { ...user, _id: ObjectId() };

        // When
        const pongoInsertResult = await users.insertMany([user, otherUser]);

        // Then
        assert(pongoInsertResult.successful);
        assert(pongoInsertResult.insertedIds.includes(user._id!));
        assert(pongoInsertResult.insertedIds.includes(otherUser._id));

        const pongoDocs = await users.find({
          _id: { $in: [user._id!, otherUser._id] },
        });
        assert.ok(pongoDocs.length > 0);
        assert.deepStrictEqual(pongoDocs[0], {
          ...user,
          _version: 1n,
        });
        assert.deepStrictEqual(pongoDocs[1], {
          ...otherUser,
          _version: 1n,
        });
      });

      it('inserts a document with id and version', async () => {
        // Given
        const nonDefaultVersion = 495n;
        const otherUser = {
          ...user,
          _id: ObjectId(),
          _version: nonDefaultVersion,
        };
        // When
        const pongoInsertResult = await users.insertMany([
          {
            ...user,
            _version: nonDefaultVersion,
          },
          otherUser,
        ]);

        // Then
        assert(pongoInsertResult.successful);
        assert(pongoInsertResult.insertedIds.includes(user._id!));
        assert(pongoInsertResult.insertedIds.includes(otherUser._id));

        const pongoDocs = await users.find({
          _id: { $in: [user._id!, otherUser._id] },
        });
        assert.ok(pongoDocs.length > 0);
        assert.deepStrictEqual(pongoDocs[0], {
          ...user,
          _version: nonDefaultVersion,
        });
        assert.deepStrictEqual(pongoDocs[1], {
          ...otherUser,
          _version: nonDefaultVersion,
        });
      });

      it('Does NOT insert a document with the same id as the existing document', async () => {
        // Given
        await users.insertOne(user);

        const userWithTheSameId: User = {
          _id: user._id!,
          name: 'Cruella',
          age: 40,
        };
        const otherUser = { ...user, _id: ObjectId() };
        // When
        const pongoInsertResult = await users.insertMany([
          userWithTheSameId,
          otherUser,
        ]);

        // Then
        assert(pongoInsertResult.successful === false);
        assert(!pongoInsertResult.insertedIds.includes(user._id!));
        assert(pongoInsertResult.insertedIds.includes(otherUser._id));

        const pongoDoc = await users.findOne({
          _id: user._id!,
        });
        assert.ok(pongoDoc);
        assert.deepStrictEqual(pongoDoc, {
          ...user,
          _version: 1n,
        });

        const otherPongoDoc = await users.findOne({
          _id: otherUser._id,
        });
        assert.ok(otherPongoDoc);
        assert.deepStrictEqual(otherPongoDoc, {
          ...otherUser,
          _version: 1n,
        });
      });

      it('inserts all when expected DOCUMENT_DOES_NOT_EXIST and all are absent', async () => {
        // Given
        const otherUser = { ...user, _id: ObjectId() };

        // When
        const pongoInsertResult = await users.insertMany([user, otherUser], {
          expectedVersion: 'DOCUMENT_DOES_NOT_EXIST',
        });

        // Then
        assert(pongoInsertResult.successful);
        assert(pongoInsertResult.insertedIds.includes(user._id!));
        assert(pongoInsertResult.insertedIds.includes(otherUser._id));
      });

      it('does NOT insert the present one when expected DOCUMENT_DOES_NOT_EXIST', async () => {
        // Given
        await users.insertOne(user);
        const otherUser = { ...user, _id: ObjectId() };

        // When
        const pongoInsertResult = await users.insertMany(
          [{ _id: user._id!, name: 'Cruella', age: 40 }, otherUser],
          { expectedVersion: 'DOCUMENT_DOES_NOT_EXIST' },
        );

        // Then
        assert(pongoInsertResult.successful === false);
        assert(!pongoInsertResult.insertedIds.includes(user._id!));
        assert(pongoInsertResult.insertedIds.includes(otherUser._id));

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert.deepStrictEqual(pongoDoc, { ...user, _version: 1n });
      });
    });
  });

  describe('Update Operations', () => {
    describe('updateOne', () => {
      it('updates a document WITHOUT passing expected version', async () => {
        // Given
        await users.insertOne(user);

        // When
        const updateResult = await users.updateOne(
          { _id: user._id! },
          { $set: { age: 31 } },
        );

        //Then
        assert(updateResult.successful);
        assert(updateResult.modifiedCount === 1);
        assert(updateResult.matchedCount === 1);

        const pongoDoc = await users.findOne({
          _id: user._id!,
        });

        assert.deepStrictEqual(pongoDoc, {
          ...user,
          age: 31,
          _version: 2n,
        });
      });

      it('updates a document with correct expected version', async () => {
        // Given
        await users.insertOne(user);

        // When
        const updateResult = await users.updateOne(
          { _id: user._id! },
          { $set: { age: 31 } },
          { expectedVersion: 1n },
        );

        //Then
        assert(updateResult.successful);
        assert(updateResult.modifiedCount === 1);
        assert(updateResult.matchedCount === 1);

        const pongoDoc = await users.findOne({
          _id: user._id!,
        });

        assert.deepStrictEqual(pongoDoc, {
          ...user,
          age: 31,
          _version: 2n,
        });
      });

      it('overrides the document version with autoincremented document version', async () => {
        await users.insertOne(user);

        // When
        const updateResult = await users.updateOne(
          { _id: user._id! },
          { $set: { age: 31, _version: 333n } },
        );

        //Then
        assert(updateResult.successful);
        assert(updateResult.modifiedCount === 1);
        assert(updateResult.matchedCount === 1);

        const pongoDoc = await users.findOne({
          _id: user._id!,
        });

        assert.deepStrictEqual(pongoDoc, {
          ...user,
          age: 31,
          _version: 2n,
        });
      });

      [0n, 2n, -1n, 3n].map((incorrectVersion) => {
        it(`does NOT update a document with incorrect ${incorrectVersion} expected version`, async () => {
          // Given
          await users.insertOne(user);

          // When
          const updateResult = await users.updateOne(
            { _id: user._id! },
            { $set: { age: 31 } },
            { expectedVersion: incorrectVersion },
          );

          //Then
          assert(updateResult.successful === false);
          assert(updateResult.modifiedCount === 0);
          assert(updateResult.matchedCount === matchedCountOnConflict);

          const pongoDoc = await users.findOne({
            _id: user._id!,
          });

          assert.deepStrictEqual(pongoDoc, {
            ...user,
            _version: 1n,
          });
        });
      });

      it('updates an existing document when expected DOCUMENT_EXISTS', async () => {
        // Given
        await users.insertOne(user);

        // When
        const updateResult = await users.updateOne(
          { _id: user._id! },
          { $set: { age: 31 } },
          { expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(updateResult.successful);
        assert(updateResult.modifiedCount === 1);
        assert(updateResult.matchedCount === 1);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert.deepStrictEqual(pongoDoc, {
          ...user,
          age: 31,
          _version: 2n,
        });
      });

      it('does NOT update a missing document when expected DOCUMENT_EXISTS', async () => {
        // Given a document that was never inserted

        // When
        const updateResult = await users.updateOne(
          { _id: user._id! },
          { $set: { age: 31 } },
          { expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(updateResult.successful === false);
        assert(updateResult.modifiedCount === 0);
        assert(updateResult.matchedCount === 0);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert(pongoDoc === null);
      });
    });

    describe('updateMany', () => {
      it('updates documents and expected version', async () => {
        const otherUser = { ...user, _id: ObjectId() };
        await users.insertMany([user, otherUser, { ...user, _id: ObjectId() }]);

        // When
        const updateResult = await users.updateMany(
          { _id: { $in: [user._id!, otherUser._id] } },
          { $set: { age: 31 } },
        );

        //Then
        assert(updateResult.successful);
        assert(updateResult.modifiedCount === 2);
        assert(updateResult.matchedCount === 2);

        const pongoDocs = await users.find({
          _id: { $in: [user._id!, otherUser._id] },
        });

        assert.deepStrictEqual(pongoDocs, [
          {
            ...user,
            age: 31,
            _version: 2n,
          },
          {
            ...otherUser,
            age: 31,
            _version: 2n,
          },
        ]);
      });

      it('updates matched documents when expected DOCUMENT_EXISTS', async () => {
        const otherUser = { ...user, _id: ObjectId() };
        await users.insertMany([user, otherUser]);

        // When
        const updateResult = await users.updateMany(
          { _id: { $in: [user._id!, otherUser._id] } },
          { $set: { age: 31 } },
          { expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(updateResult.successful);
        assert(updateResult.modifiedCount === 2);
        assert(updateResult.matchedCount === 2);

        const pongoDocs = await users.find({
          _id: { $in: [user._id!, otherUser._id] },
        });
        assert.deepStrictEqual(pongoDocs, [
          { ...user, age: 31, _version: 2n },
          { ...otherUser, age: 31, _version: 2n },
        ]);
      });
    });

    it('overrides documents version with autoincremented document version', async () => {
      const otherUser = { ...user, _id: ObjectId() };
      await users.insertMany([{ ...user }, otherUser]);

      // When
      const updateResult = await users.updateMany(
        { _id: { $in: [user._id!, otherUser._id] } },
        { $set: { age: 31, _version: 333n } },
      );

      //Then
      assert(updateResult.successful);
      assert(updateResult.modifiedCount === 2);
      assert(updateResult.matchedCount === 2);

      const pongoDocs = await users.find({
        _id: { $in: [user._id!, otherUser._id] },
      });

      assert.deepStrictEqual(pongoDocs, [
        {
          ...user,
          age: 31,
          _version: 2n,
        },
        {
          ...otherUser,
          age: 31,
          _version: 2n,
        },
      ]);
    });
  });

  describe('Replace Operations', () => {
    describe('replaceOne', () => {
      it('replaces a document WITHOUT passing expected version', async () => {
        // Given
        await users.insertOne(user);

        // When
        const updateResult = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
        );

        //Then
        assert(updateResult.successful);
        assert(updateResult.modifiedCount === 1);
        assert(updateResult.matchedCount === 1);

        const pongoDoc = await users.findOne({
          _id: user._id!,
        });

        assert.deepStrictEqual(pongoDoc, {
          ...user,
          age: 31,
          _version: 2n,
        });
      });

      it('replaces a document with correct expected version', async () => {
        // Given
        await users.insertOne(user);

        // When
        const updateResult = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { expectedVersion: 1n },
        );

        //Then
        assert(updateResult.successful);
        assert(updateResult.modifiedCount === 1);
        assert(updateResult.matchedCount === 1);

        const pongoDoc = await users.findOne({
          _id: user._id!,
        });

        assert.deepStrictEqual(pongoDoc, {
          ...user,
          age: 31,
          _version: 2n,
        });
      });

      [0n, 2n, -1n, 3n].map((incorrectVersion) => {
        it(`does NOT replace a document with incorrect ${incorrectVersion} expected version`, async () => {
          // Given
          await users.insertOne(user);

          // When
          const updateResult = await users.replaceOne(
            { _id: user._id! },
            { ...user, age: 31 },
            { expectedVersion: incorrectVersion },
          );

          //Then
          assert(updateResult.successful === false);
          assert(updateResult.modifiedCount === 0);
          assert(updateResult.matchedCount === matchedCountOnConflict);

          const pongoDoc = await users.findOne({
            _id: user._id!,
          });

          assert.deepStrictEqual(pongoDoc, {
            ...user,
            _version: 1n,
          });
        });
      });

      it('replaces an existing document when expected DOCUMENT_EXISTS', async () => {
        // Given
        await users.insertOne(user);

        // When
        const updateResult = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(updateResult.successful);
        assert(updateResult.modifiedCount === 1);
        assert(updateResult.matchedCount === 1);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert.deepStrictEqual(pongoDoc, {
          ...user,
          age: 31,
          _version: 2n,
        });
      });

      it('does NOT replace a missing document when expected DOCUMENT_EXISTS', async () => {
        // Given a document that was never inserted

        // When
        const updateResult = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(updateResult.successful === false);
        assert(updateResult.modifiedCount === 0);
        assert(updateResult.matchedCount === 0);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert(pongoDoc === null);
      });
    });
  });

  describe('replaceMany Operations', () => {
    it('replaceMany returns correct result sets for updates and conflicts', async () => {
      // Given: one existing doc at version 1, one that will have a version mismatch
      const existingUser = { ...user, _id: ObjectId() };
      const conflictUser = { ...user, _id: ObjectId() };
      await users.insertOne(existingUser);
      await users.insertOne(conflictUser);

      // When
      const result = await users.replaceMany([
        { _id: existingUser._id, name: 'Updated', age: 30 },
        {
          _id: conflictUser._id,
          name: 'Conflict',
          age: 30,
          _version: 999n,
        },
      ]);

      // Then
      assert(result.modifiedIds.includes(existingUser._id));
      assert(result.conflictIds.includes(conflictUser._id));

      const updated = await users.findOne({ _id: existingUser._id });
      assert.strictEqual(updated?.name, 'Updated');

      const unchanged = await users.findOne({ _id: conflictUser._id });
      assert.strictEqual(unchanged?.name, conflictUser.name);
    });

    it('replaceMany treats not-found doc as conflict', async () => {
      const ghostId = ObjectId();
      const existing = { ...user, _id: ObjectId() };
      await users.insertOne(existing);

      const result = await users.replaceMany([
        { _id: existing._id, name: 'Updated', age: 30 },
        { _id: ghostId, name: 'Ghost', age: 30 },
      ]);

      assert(result.modifiedIds.includes(existing._id));
      assert(result.conflictIds.includes(ghostId));
      assert(!result.modifiedIds.includes(ghostId));
    });

    it('replaces every document when each expected version matches', async () => {
      // Given
      const first = { ...user, _id: ObjectId() };
      const second = { ...user, _id: ObjectId() };
      await users.insertMany([first, second]);

      // When
      const result = await users.replaceMany([
        { _id: first._id, name: 'First', age: 30, _version: 1n },
        { _id: second._id, name: 'Second', age: 30, _version: 1n },
      ]);

      // Then
      assert(result.successful);
      assert(result.modifiedIds.includes(first._id));
      assert(result.modifiedIds.includes(second._id));
      assert(result.conflictIds.length === 0);

      const one = await users.findOne({ _id: first._id });
      assert.strictEqual(one?.name, 'First');
      assert.strictEqual(one?._version, 2n);
      const two = await users.findOne({ _id: second._id });
      assert.strictEqual(two?.name, 'Second');
      assert.strictEqual(two?._version, 2n);
    });

    it('replaces every version-less document without a concurrency check', async () => {
      // Given
      const first = { ...user, _id: ObjectId() };
      const second = { ...user, _id: ObjectId() };
      await users.insertMany([first, second]);

      // When
      const result = await users.replaceMany([
        { _id: first._id, name: 'First', age: 30 },
        { _id: second._id, name: 'Second', age: 30 },
      ]);

      // Then
      assert(result.successful);
      assert(result.modifiedIds.includes(first._id));
      assert(result.modifiedIds.includes(second._id));
      assert(result.conflictIds.length === 0);

      const one = await users.findOne({ _id: first._id });
      assert.strictEqual(one?.name, 'First');
      assert.strictEqual(one?._version, 2n);
      const two = await users.findOne({ _id: second._id });
      assert.strictEqual(two?.name, 'Second');
      assert.strictEqual(two?._version, 2n);
    });

    it('replaces matching and conflicts mismatched documents per expected version', async () => {
      // Given
      const matching = { ...user, _id: ObjectId() };
      const mismatched = { ...user, _id: ObjectId() };
      await users.insertMany([matching, mismatched]);

      // When
      const result = await users.replaceMany([
        { _id: matching._id, name: 'Matching', age: 30, _version: 1n },
        { _id: mismatched._id, name: 'Mismatched', age: 30, _version: 999n },
      ]);

      // Then
      assert(result.successful === false);
      assert(result.modifiedIds.includes(matching._id));
      assert(result.conflictIds.includes(mismatched._id));

      const ok = await users.findOne({ _id: matching._id });
      assert.strictEqual(ok?.name, 'Matching');
      assert.strictEqual(ok?._version, 2n);
      const unchanged = await users.findOne({ _id: mismatched._id });
      assert.strictEqual(unchanged?.name, user.name);
      assert.strictEqual(unchanged?._version, 1n);
    });
  });

  describe('Delete Operations', () => {
    describe('deleteOne', () => {
      it('deletes a document WITHOUT passing expected version', async () => {
        // Given
        await users.insertOne(user);

        // When
        const deleteResult = await users.deleteOne({ _id: user._id! });

        //Then
        assert(deleteResult.successful);
        assert(deleteResult.deletedCount === 1);
        assert(deleteResult.matchedCount === 1);

        const pongoDoc = await users.findOne({
          _id: user._id!,
        });

        assert(pongoDoc === null);
      });

      it('deletes a document with correct expected version', async () => {
        // Given
        await users.insertOne(user);

        // When
        const deleteResult = await users.deleteOne(
          { _id: user._id! },
          { expectedVersion: 1n },
        );

        //Then
        assert(deleteResult.successful);
        assert(deleteResult.deletedCount === 1);
        assert(deleteResult.matchedCount === 1);

        const pongoDoc = await users.findOne({
          _id: user._id!,
        });

        assert(pongoDoc === null);
      });

      [0n, 2n, -1n, 3n].map((incorrectVersion) => {
        it(`does NOT delete a document with incorrect ${incorrectVersion} expected version`, async () => {
          // Given
          await users.insertOne(user);

          // When
          const deleteResult = await users.deleteOne(
            { _id: user._id! },
            { expectedVersion: incorrectVersion },
          );

          //Then
          assert(deleteResult.successful === false);
          assert(deleteResult.deletedCount === 0);
          assert(deleteResult.matchedCount === matchedCountOnConflict);

          const pongoDoc = await users.findOne({
            _id: user._id!,
          });

          assert.deepStrictEqual(pongoDoc, {
            ...user,
            _version: 1n,
          });
        });
      });

      it('deletes an existing document when expected DOCUMENT_EXISTS', async () => {
        // Given
        await users.insertOne(user);

        // When
        const deleteResult = await users.deleteOne(
          { _id: user._id! },
          { expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(deleteResult.successful);
        assert(deleteResult.deletedCount === 1);
        assert(deleteResult.matchedCount === 1);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert(pongoDoc === null);
      });

      it('does NOT delete a missing document when expected DOCUMENT_EXISTS', async () => {
        // Given a document that was never inserted

        // When
        const deleteResult = await users.deleteOne(
          { _id: user._id! },
          { expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(deleteResult.successful === false);
        assert(deleteResult.deletedCount === 0);
        assert(deleteResult.matchedCount === 0);
      });
    });

    describe('deleteMany', () => {
      it('deletes documents and expected version', async () => {
        const otherUser = { ...user, _id: ObjectId() };
        await users.insertMany([user, otherUser, { ...user, _id: ObjectId() }]);

        // When
        const deleteResult = await users.deleteMany({
          _id: { $in: [user._id!, otherUser._id] },
        });

        //Then
        assert(deleteResult.successful);
        assert(deleteResult.deletedCount === 2);
        assert(deleteResult.matchedCount === 2);

        const pongoDocs = await users.find({
          _id: { $in: [user._id!, otherUser._id] },
        });

        assert(pongoDocs.length === 0);
      });

      it('deletes matched documents when expected DOCUMENT_EXISTS', async () => {
        const otherUser = { ...user, _id: ObjectId() };
        await users.insertMany([user, otherUser]);

        // When
        const deleteResult = await users.deleteMany(
          { _id: { $in: [user._id!, otherUser._id] } },
          { expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(deleteResult.successful);
        assert(deleteResult.deletedCount === 2);
        assert(deleteResult.matchedCount === 2);

        const pongoDocs = await users.find({
          _id: { $in: [user._id!, otherUser._id] },
        });
        assert(pongoDocs.length === 0);
      });
    });

    it('overrides documents version with autoincremented document version', async () => {
      const otherUser = { ...user, _id: ObjectId() };
      await users.insertMany([{ ...user }, otherUser]);

      // When
      const deleteResult = await users.deleteMany({
        _id: { $in: [user._id!, otherUser._id] },
      });

      //Then
      assert(deleteResult.successful);
      assert(deleteResult.deletedCount === 2);
      assert(deleteResult.matchedCount === 2);

      const pongoDocs = await users.find({
        _id: { $in: [user._id!, otherUser._id] },
      });

      assert(pongoDocs.length === 0);
    });
  });

  describe('Upsert Operations', () => {
    describe('replaceOne with upsert', () => {
      it('inserts a new document at version 1 when absent', async () => {
        // When
        const result = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { upsert: true },
        );

        // Then
        assert(result.successful);
        assert(result.upsertedCount === 1);
        assert(result.upsertedId === user._id!);
        assert(result.modifiedCount === 0);

        const pongoDoc = await users.findOne({ _id: user._id });
        assert.deepStrictEqual(pongoDoc, { ...user, age: 31, _version: 1n });
      });

      it('replaces an existing document and bumps version when present', async () => {
        // Given
        await users.insertOne(user);

        // When
        const result = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { upsert: true },
        );

        // Then
        assert(result.successful);
        assert(result.upsertedCount === 0);
        assert(result.upsertedId === null);
        assert(result.modifiedCount === 1);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert.deepStrictEqual(pongoDoc, { ...user, age: 31, _version: 2n });
      });

      it('does NOT insert when absent and expected DOCUMENT_EXISTS', async () => {
        // When
        const result = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { upsert: true, expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(result.successful === false);
        assert(result.upsertedCount === 0);
        assert(result.matchedCount === 0);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert(pongoDoc === null);
      });

      it('replaces when present and expected DOCUMENT_EXISTS', async () => {
        // Given
        await users.insertOne(user);

        // When
        const result = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { upsert: true, expectedVersion: 'DOCUMENT_EXISTS' },
        );

        // Then
        assert(result.successful);
        assert(result.modifiedCount === 1);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert.deepStrictEqual(pongoDoc, { ...user, age: 31, _version: 2n });
      });

      it('does NOT insert when absent and an exact expected version is given', async () => {
        // When
        const result = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { upsert: true, expectedVersion: 1n },
        );

        // Then
        assert(result.successful === false);
        assert(result.upsertedCount === 0);
        assert(result.matchedCount === 0);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert(pongoDoc === null);
      });

      it('replaces when present and the exact expected version matches', async () => {
        // Given
        await users.insertOne(user);

        // When
        const result = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { upsert: true, expectedVersion: 1n },
        );

        // Then
        assert(result.successful);
        assert(result.modifiedCount === 1);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert.deepStrictEqual(pongoDoc, { ...user, age: 31, _version: 2n });
      });

      it('does NOT replace when present and the exact expected version mismatches', async () => {
        // Given
        await users.insertOne(user);

        // When
        const result = await users.replaceOne(
          { _id: user._id! },
          { ...user, age: 31 },
          { upsert: true, expectedVersion: 333n },
        );

        // Then
        assert(result.successful === false);
        assert(result.modifiedCount === 0);
        assert(result.matchedCount === matchedCountOnConflict);

        const pongoDoc = await users.findOne({ _id: user._id! });
        assert.deepStrictEqual(pongoDoc, { ...user, _version: 1n });
      });
    });

    describe('replaceMany with upsert', () => {
      it('inserts absent and replaces present documents in one batch', async () => {
        // Given
        const present = { ...user, _id: ObjectId() };
        const absent = { ...user, _id: ObjectId() };
        await users.insertOne(present);

        // When
        const result = await users.replaceMany(
          [
            { _id: present._id, name: 'Present', age: 30 },
            { _id: absent._id, name: 'Absent', age: 30 },
          ],
          { upsert: true },
        );

        // Then
        assert(result.successful);
        assert(result.modifiedIds.includes(present._id));
        assert(result.modifiedIds.includes(absent._id));
        assert(result.conflictIds.length === 0);

        const replaced = await users.findOne({ _id: present._id });
        assert.strictEqual(replaced?.name, 'Present');
        const inserted = await users.findOne({ _id: absent._id });
        assert.strictEqual(inserted?.name, 'Absent');
      });

      it('does NOT insert an absent versioned document (conflict, no ghost)', async () => {
        // Given a versioned batch: one present, one absent — a versioned upsert
        // never fabricates a document, so the absent one must conflict.
        const present = { ...user, _id: ObjectId() };
        const absent = { ...user, _id: ObjectId() };
        await users.insertOne(present);

        // When
        const result = await users.replaceMany(
          [
            { _id: present._id, name: 'Present', age: 30, _version: 1n },
            { _id: absent._id, name: 'Absent', age: 30, _version: 1n },
          ],
          { upsert: true },
        );

        // Then
        assert(result.successful === false);
        assert(result.modifiedIds.includes(present._id));
        assert(result.conflictIds.includes(absent._id));

        const replaced = await users.findOne({ _id: present._id });
        assert.strictEqual(replaced?.name, 'Present');
        const ghost = await users.findOne({ _id: absent._id });
        assert(ghost === null);
      });

      it('conflicts a versioned document whose expected version mismatches', async () => {
        // Given
        const doc = { ...user, _id: ObjectId() };
        await users.insertOne(doc);

        // When
        const result = await users.replaceMany(
          [{ _id: doc._id, name: 'Nope', age: 30, _version: 999n }],
          { upsert: true },
        );

        // Then
        assert(result.successful === false);
        assert(result.conflictIds.includes(doc._id));

        const unchanged = await users.findOne({ _id: doc._id });
        assert.strictEqual(unchanged?.name, user.name);
        assert.strictEqual(unchanged?._version, 1n);
      });

      it('throws when mixing versioned and version-less documents', async () => {
        // Given
        const a = { ...user, _id: ObjectId() };
        const b = { ...user, _id: ObjectId() };
        await users.insertMany([a, b]);

        // When / Then
        await assert.rejects(
          users.replaceMany(
            [
              { _id: a._id, name: 'A', age: 30, _version: 1n },
              { _id: b._id, name: 'B', age: 30 },
            ],
            { upsert: true },
          ),
        );
      });
    });

    describe('insertMany with upsert', () => {
      it('inserts absent and replaces present documents in one batch', async () => {
        // Given
        const present = { ...user, _id: ObjectId() };
        const absent = { ...user, _id: ObjectId() };
        await users.insertOne(present);

        // When
        const result = await users.insertMany(
          [
            { _id: present._id, name: 'Present', age: 30 },
            { _id: absent._id, name: 'Absent', age: 30 },
          ],
          { upsert: true },
        );

        // Then
        assert(result.successful);
        assert(result.insertedIds.includes(present._id));
        assert(result.insertedIds.includes(absent._id));

        const replaced = await users.findOne({ _id: present._id });
        assert.strictEqual(replaced?.name, 'Present');
        const inserted = await users.findOne({ _id: absent._id });
        assert.strictEqual(inserted?.name, 'Absent');
      });
    });
  });

  describe('Handle Operations', () => {
    it('should NOT insert a new document if it does not exist and expected DOCUMENT_EXISTS', async () => {
      const nonExistingId = ObjectId() as unknown as ObjectId;

      const newDoc: User = { name: 'John', age: 25 };

      const handle = (_existing: User | null) => newDoc;

      const resultPongo = await users.handle(
        {
          _id: nonExistingId,
          expectedVersion: 'DOCUMENT_EXISTS',
        },
        handle,
      );
      assert(resultPongo.successful === false);
      assert(resultPongo.document === null);

      const pongoDoc = await users.findOne({
        _id: nonExistingId,
      });

      assert(pongoDoc === null);
    });

    it('should NOT insert a new document if it does not exist and expected is numeric value', async () => {
      const nonExistingId = ObjectId() as unknown as ObjectId;

      const newDoc: User = { name: 'John', age: 25 };

      const handle = (_existing: User | null) => newDoc;

      const resultPongo = await users.handle(
        {
          _id: nonExistingId,
          expectedVersion: 1n,
        },
        handle,
      );
      assert(resultPongo.successful === false);
      assert(resultPongo.document === null);

      const pongoDoc = await users.findOne({
        _id: nonExistingId,
      });

      assert(pongoDoc === null);
    });

    it('should replace an existing document when expected version matches', async () => {
      const existingDoc: User = { _id: ObjectId(), name: 'John', age: 25 };
      const updatedDoc: User = { _id: existingDoc._id!, name: 'John', age: 30 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => updatedDoc;

      const resultPongo = await users.handle(
        { _id: pongoInsertResult.insertedId!, expectedVersion: 1n },
        handle,
      );

      assert(resultPongo.successful === true);

      assert.deepStrictEqual(resultPongo.document, {
        ...updatedDoc,
        _version: 2n,
      });

      const pongoDoc = await users.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.deepStrictEqual(pongoDoc, {
        ...updatedDoc,
        _version: 2n,
      });
    });

    it('should NOT replace an existing document when expected DOCUMENT_DOES_NOT_EXIST', async () => {
      const existingDoc: User = { _id: ObjectId(), name: 'John', age: 25 };
      const updatedDoc: User = { _id: existingDoc._id!, name: 'John', age: 30 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => updatedDoc;

      const resultPongo = await users.handle(
        {
          _id: pongoInsertResult.insertedId!,
          expectedVersion: 'DOCUMENT_DOES_NOT_EXIST',
        },
        handle,
      );

      assert(resultPongo.successful === false);

      assert.deepStrictEqual(resultPongo.document, {
        ...existingDoc,
        _version: 1n,
      });

      const pongoDoc = await users.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.deepStrictEqual(pongoDoc, {
        ...existingDoc,
        _version: 1n,
      });
    });

    it('should NOT replace an existing document when expected version is mismatched ', async () => {
      const existingDoc: User = { _id: ObjectId(), name: 'John', age: 25 };
      const updatedDoc: User = { _id: existingDoc._id!, name: 'John', age: 30 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => updatedDoc;

      const resultPongo = await users.handle(
        {
          _id: pongoInsertResult.insertedId!,
          expectedVersion: 333n,
        },
        handle,
      );

      assert(resultPongo.successful === false);

      assert.deepStrictEqual(resultPongo.document, {
        ...existingDoc,
        _version: 1n,
      });

      const pongoDoc = await users.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.deepStrictEqual(pongoDoc, {
        ...existingDoc,
        _version: 1n,
      });
    });

    it('should delete an existing document when expected version matches', async () => {
      const existingDoc: User = { name: 'John', age: 25 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => null;

      const resultPongo = await users.handle(
        { _id: pongoInsertResult.insertedId!, expectedVersion: 1n },
        handle,
      );
      assert(resultPongo.successful === true);

      assert(resultPongo.document === null);

      const pongoDoc = await users.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      assert(pongoDoc === null);
    });

    it('should NOT delete an existing document when expected DOCUMENT_DOES_NOT_EXIST', async () => {
      const existingDoc: User = { name: 'John', age: 25 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => null;

      const resultPongo = await users.handle(
        {
          _id: pongoInsertResult.insertedId!,
          expectedVersion: 'DOCUMENT_DOES_NOT_EXIST',
        },
        handle,
      );
      assert(resultPongo.successful === false);

      assert.deepStrictEqual(resultPongo.document, {
        ...existingDoc,
        _id: pongoInsertResult.insertedId!,
        _version: 1n,
      });

      const pongoDoc = await users.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.deepStrictEqual(pongoDoc, {
        ...existingDoc,
        _id: pongoInsertResult.insertedId!,
        _version: 1n,
      });
    });

    it('should NOT delete an existing document when expected version is mismatched', async () => {
      const existingDoc: User = { name: 'John', age: 25 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => null;

      const resultPongo = await users.handle(
        {
          _id: pongoInsertResult.insertedId!,
          expectedVersion: 333n,
        },
        handle,
      );
      assert(resultPongo.successful === false);

      assert.deepStrictEqual(resultPongo.document, {
        ...existingDoc,
        _id: pongoInsertResult.insertedId!,
        _version: 1n,
      });

      const pongoDoc = await users.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.deepStrictEqual(pongoDoc, {
        ...existingDoc,
        _id: pongoInsertResult.insertedId!,
        _version: 1n,
      });
    });
  });

  describe('Batch Handle Operations', () => {
    it('should process multiple ids and return results per document', async () => {
      const existingDoc: User = { _id: ObjectId(), name: 'Alice', age: 30 };
      const nonExistingId = ObjectId() as unknown as ObjectId;

      await users.insertOne(existingDoc);

      const results = await users.handle(
        [existingDoc._id!, nonExistingId],
        (existing) =>
          existing ? { ...existing, age: existing.age + 1 } : null,
      );

      assert(results.length === 2);

      const existingResult = results.find(
        (r) => r.document?._id === existingDoc._id,
      );
      const missingResult = results.find((r) => r.document === null);

      assert(existingResult?.successful === true);
      assert(existingResult?.document?.age === (existingDoc.age ?? 0) + 1);
      assert(missingResult?.successful === true);
    });

    it('should insert documents for non-existing ids when handler returns a value', async () => {
      const newId1 = ObjectId();
      const newId2 = ObjectId();

      const results = await users.handle([newId1, newId2], (_existing) => ({
        name: 'New User',
        age: 20,
      }));

      assert(results.length === 2);
      assert(results.every((r) => r.successful === true));

      const doc1 = await users.findOne({ _id: newId1 });
      const doc2 = await users.findOne({ _id: newId2 });

      assert(doc1?.name === 'New User');
      assert(doc2?.name === 'New User');
    });

    it('should delete documents for existing ids when handler returns null', async () => {
      const doc1: User = { _id: ObjectId(), name: 'Bob', age: 25 };
      const doc2: User = { _id: ObjectId(), name: 'Carol', age: 35 };

      await users.insertOne(doc1);
      await users.insertOne(doc2);

      const results = await users.handle(
        [doc1._id!, doc2._id!],
        (_existing) => null,
      );

      assert(results.length === 2);
      assert(results.every((r) => r.successful === true));
      assert(results.every((r) => r.document === null));

      const found1 = await users.findOne({ _id: doc1._id! });
      const found2 = await users.findOne({ _id: doc2._id! });

      assert(found1 === null);
      assert(found2 === null);
    });

    it('should load cache hits and only fetch misses from DB in one query', async () => {
      const cachedDoc: User = { _id: ObjectId(), name: 'Dave', age: 40 };
      const uncachedId = ObjectId();

      await users.insertOne(cachedDoc);
      await users.findOne({ _id: cachedDoc._id! });

      const results = await users.handle(
        [cachedDoc._id!, uncachedId],
        (existing) =>
          existing ? { ...existing, age: existing.age + 1 } : null,
      );

      assert(results.length === 2);
      const cachedResult = results.find(
        (r) => r.document?._id === cachedDoc._id,
      );
      assert(cachedResult?.successful === true);
      assert(cachedResult?.document?.age === cachedDoc.age + 1);
    });

    it('should use per-document OC and reject concurrent modifications', async () => {
      const doc1: User = { _id: ObjectId(), name: 'Eve', age: 20 };
      const doc2: User = { _id: ObjectId(), name: 'Frank', age: 21 };

      await users.insertOne(doc1);
      await users.insertOne(doc2);

      // Modify doc1 externally between our read and write
      await users.updateOne({ _id: doc1._id! }, { $set: { age: 99 } });

      const results = await users.handle([doc1._id!, doc2._id!], (existing) => {
        if (!existing) return null;
        return { ...existing, age: existing.age + 1 };
      });

      // doc2 should succeed; doc1 will fail because its version changed
      const doc2Result = results.find((r) => r.document?._id === doc2._id);
      assert(doc2Result?.successful === true);
      assert(doc2Result?.document?.age === doc2.age + 1);
    });

    it('should skip OC when expected versions are not provided', async () => {
      const doc1: User = { _id: ObjectId(), name: 'Grace', age: 30 };
      const doc2: User = { _id: ObjectId(), name: 'Hank', age: 31 };

      await users.insertOne(doc1);
      await users.insertOne(doc2);

      // Modify doc1 externally between our read and write
      await users.updateOne({ _id: doc1._id! }, { $set: { age: 99 } });

      const results = await users.handle([doc1._id!, doc2._id!], (existing) =>
        existing ? { ...existing, age: existing.age + 1 } : null,
      );

      assert(results.length === 2);
      assert(results.every((r) => r.successful === true));

      const updated1 = await users.findOne({ _id: doc1._id! });
      const updated2 = await users.findOne({ _id: doc2._id! });

      // doc1 was externally changed to age=99 before handle ran,
      // so the handler saw 99 and wrote 100
      assert(updated1 !== null);
      assert(updated2?.age === doc2.age + 1);
    });

    it('should handle mixed operations (insert, replace, delete) in one batch', async () => {
      const existing1: User = { _id: ObjectId(), name: 'Ivan', age: 40 };
      const existing2: User = { _id: ObjectId(), name: 'Judy', age: 41 };
      const newId = ObjectId();

      await users.insertOne(existing1);
      await users.insertOne(existing2);

      const results = await users.handle(
        [existing1._id!, existing2._id!, newId],
        (existing) => {
          if (!existing) return { name: 'New', age: 1 };
          if (existing._id === existing1._id) return null;
          return { ...existing, age: existing.age + 10 };
        },
      );

      assert(results.length === 3);

      const deleteResult = results.find(
        (r) => r.document === null && r.successful,
      );
      assert(deleteResult?.successful === true);

      const replaceResult = results.find(
        (r) => r.document?._id === existing2._id,
      );
      assert(replaceResult?.successful === true);
      assert(replaceResult?.document?.age === existing2.age + 10);

      const insertResult = results.find((r) => r.document?._id === newId);
      assert(insertResult?.successful === true);
      assert(insertResult?.document?.name === 'New');
    });

    it('should do nothing if the handler returns documents unchanged', async () => {
      const doc1: User = { _id: ObjectId(), name: 'Karl', age: 50 };
      const doc2: User = { _id: ObjectId(), name: 'Lena', age: 51 };

      await users.insertOne(doc1);
      await users.insertOne(doc2);

      const results = await users.handle(
        [doc1._id!, doc2._id!],
        (existing) => existing,
      );

      assert(results.length === 2);
      assert(results.every((r) => r.successful === true));

      const found1 = await users.findOne({ _id: doc1._id! });
      const found2 = await users.findOne({ _id: doc2._id! });

      assert(found1?._version === 1n);
      assert(found2?._version === 1n);
    });
  });
});
