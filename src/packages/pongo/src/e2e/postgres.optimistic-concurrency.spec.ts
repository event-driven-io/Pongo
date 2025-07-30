import { PostgreSQLConnectionString } from '@event-driven-io/dumbo/pg';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import console from 'console';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  ObjectId,
  pongoClient,
  pongoSchema,
  type PongoClient,
  type PongoCollection,
  type PongoDb,
} from '../';

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

void describe('MongoDB Compatibility Tests', () => {
  let postgres: StartedPostgreSqlContainer;
  let postgresConnectionString: PostgreSQLConnectionString;
  let client: PongoClient;

  let pongoDb: PongoDb;
  let users: PongoCollection<User>;

  let user: User;

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    postgresConnectionString = PostgreSQLConnectionString(
      postgres.getConnectionUri(),
    );

    const dbName = postgres.getDatabase();

    client = pongoClient(postgresConnectionString, {
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

  after(async () => {
    try {
      await client.close();
      await postgres.stop();
    } catch (error) {
      console.log(error);
    }
  });

  void describe('Insert Operations', () => {
    void describe('insertOne', () => {
      void it('inserts a document with id', async () => {
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

      void it('inserts a document with id and version', async () => {
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

      void it('Does NOT insert a document with the same id as the existing document', async () => {
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
    });

    void describe('insertMany', () => {
      void it('inserts a document with id', async () => {
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

      void it('inserts a document with id and version', async () => {
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

      void it('Does NOT insert a document with the same id as the existing document', async () => {
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
    });
  });

  void describe('Update Operations', () => {
    void describe('updateOne', () => {
      void it('updates a document WITHOUT passing expected version', async () => {
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

      void it('updates a document with correct expected version', async () => {
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

      void it('overrides the document version with autoincremented document version', async () => {
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
        void it(`does NOT update a document with incorrect ${incorrectVersion} expected version`, async () => {
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
          assert(updateResult.matchedCount === 1);

          const pongoDoc = await users.findOne({
            _id: user._id!,
          });

          assert.deepStrictEqual(pongoDoc, {
            ...user,
            _version: 1n,
          });
        });
      });
    });

    void describe('updateMany', () => {
      void it('updates documents and expected version', async () => {
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
    });

    void it('overrides documents version with autoincremented document version', async () => {
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

  void describe('Replace Operations', () => {
    void describe('replaceOne', () => {
      void it('replaces a document WITHOUT passing expected version', async () => {
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

      void it('replaces a document with correct expected version', async () => {
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
        void it(`does NOT replace a document with incorrect ${incorrectVersion} expected version`, async () => {
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
          assert(updateResult.matchedCount === 1);

          const pongoDoc = await users.findOne({
            _id: user._id!,
          });

          assert.deepStrictEqual(pongoDoc, {
            ...user,
            _version: 1n,
          });
        });
      });
    });
  });

  void describe('Delete Operations', () => {
    void describe('deleteOne', () => {
      void it('deletes a document WITHOUT passing expected version', async () => {
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

      void it('deletes a document with correct expected version', async () => {
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
        void it(`does NOT delete a document with incorrect ${incorrectVersion} expected version`, async () => {
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
          assert(deleteResult.matchedCount === 1);

          const pongoDoc = await users.findOne({
            _id: user._id!,
          });

          assert.deepStrictEqual(pongoDoc, {
            ...user,
            _version: 1n,
          });
        });
      });
    });

    void describe('deleteMany', () => {
      void it('deletes documents and expected version', async () => {
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
    });

    void it('overrides documents version with autoincremented document version', async () => {
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

  void describe('Handle Operations', () => {
    void it('should NOT insert a new document if it does not exist and expected DOCUMENT_EXISTS', async () => {
      const nonExistingId = ObjectId() as unknown as ObjectId;

      const newDoc: User = { name: 'John', age: 25 };

      const handle = (_existing: User | null) => newDoc;

      const resultPongo = await users.handle(nonExistingId, handle, {
        expectedVersion: 'DOCUMENT_EXISTS',
      });
      assert(resultPongo.successful === false);
      assert(resultPongo.document === null);

      const pongoDoc = await users.findOne({
        _id: nonExistingId,
      });

      assert(pongoDoc === null);
    });

    void it('should NOT insert a new document if it does not exist and expected is numeric value', async () => {
      const nonExistingId = ObjectId() as unknown as ObjectId;

      const newDoc: User = { name: 'John', age: 25 };

      const handle = (_existing: User | null) => newDoc;

      const resultPongo = await users.handle(nonExistingId, handle, {
        expectedVersion: 1n,
      });
      assert(resultPongo.successful === false);
      assert(resultPongo.document === null);

      const pongoDoc = await users.findOne({
        _id: nonExistingId,
      });

      assert(pongoDoc === null);
    });

    void it('should replace an existing document when expected version matches', async () => {
      const existingDoc: User = { _id: ObjectId(), name: 'John', age: 25 };
      const updatedDoc: User = { _id: existingDoc._id!, name: 'John', age: 30 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => updatedDoc;

      const resultPongo = await users.handle(
        pongoInsertResult.insertedId!,
        handle,
        {
          expectedVersion: 1n,
        },
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

    void it('should NOT replace an existing document when expected DOCUMENT_DOES_NOT_EXIST', async () => {
      const existingDoc: User = { _id: ObjectId(), name: 'John', age: 25 };
      const updatedDoc: User = { _id: existingDoc._id!, name: 'John', age: 30 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => updatedDoc;

      const resultPongo = await users.handle(
        pongoInsertResult.insertedId!,
        handle,
        {
          expectedVersion: 'DOCUMENT_DOES_NOT_EXIST',
        },
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

    void it('should NOT replace an existing document when expected version is mismatched ', async () => {
      const existingDoc: User = { _id: ObjectId(), name: 'John', age: 25 };
      const updatedDoc: User = { _id: existingDoc._id!, name: 'John', age: 30 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => updatedDoc;

      const resultPongo = await users.handle(
        pongoInsertResult.insertedId!,
        handle,
        {
          expectedVersion: 333n,
        },
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

    void it('should delete an existing document when expected version matches', async () => {
      const existingDoc: User = { name: 'John', age: 25 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => null;

      const resultPongo = await users.handle(
        pongoInsertResult.insertedId!,
        handle,
        {
          expectedVersion: 1n,
        },
      );
      assert(resultPongo.successful === true);

      assert(resultPongo.document === null);

      const pongoDoc = await users.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      assert(pongoDoc === null);
    });

    void it('should NOT delete an existing document when expected DOCUMENT_DOES_NOT_EXIST', async () => {
      const existingDoc: User = { name: 'John', age: 25 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => null;

      const resultPongo = await users.handle(
        pongoInsertResult.insertedId!,
        handle,
        {
          expectedVersion: 'DOCUMENT_DOES_NOT_EXIST',
        },
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

    void it('should NOT delete an existing document when expected version is mismatched', async () => {
      const existingDoc: User = { name: 'John', age: 25 };

      const pongoInsertResult = await users.insertOne(existingDoc);

      const handle = (_existing: User | null) => null;

      const resultPongo = await users.handle(
        pongoInsertResult.insertedId!,
        handle,
        {
          expectedVersion: 333n,
        },
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
});
