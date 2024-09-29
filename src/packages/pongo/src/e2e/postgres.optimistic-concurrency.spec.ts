import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import console from 'console';
import { after, before, beforeEach, describe, it } from 'node:test';
import { v4 as uuid } from 'uuid';
import {
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
  let postgresConnectionString: string;
  let client: PongoClient;

  let pongoDb: PongoDb;
  let users: PongoCollection<User>;

  let user: User;

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    postgresConnectionString = postgres.getConnectionUri();

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
      _id: uuid(),
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
        const otherUser = { ...user, _id: uuid() };

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
          _id: uuid(),
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
        const otherUser = { ...user, _id: uuid() };
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

  // void describe('Delete Operations', () => {
  //   void it('should delete a document from both PostgreSQL and MongoDB', async () => {
  //     const pongoCollection = pongoDb.collection<User>('testCollection');
  //     const doc = { name: 'Cruella', age: 35 };

  //     const pongoInsertResult = await pongoCollection.insertOne(doc);

  //     const { deletedCount } = await pongoCollection.deleteOne({
  //       _id: pongoInsertResult.insertedId!,
  //     });
  //     assert.equal(deletedCount, 1);

  //     const pongoDoc = await pongoCollection.findOne({
  //       _id: pongoInsertResult.insertedId!,
  //     });

  //     assert.strictEqual(pongoDoc, null);
  //   });
  // });

  // void describe('Handle Operations', () => {
  //   void it('should insert a new document if it does not exist', async () => {
  //     const pongoCollection = pongoDb.collection<User>('handleCollection');
  //     const nonExistingId = uuid() as unknown as ObjectId;

  //     const newDoc: User = { name: 'John', age: 25 };

  //     const handle = (_existing: User | null) => newDoc;

  //     const resultPongo = await pongoCollection.handle(nonExistingId, handle);
  //     assert.deepStrictEqual(resultPongo, { ...newDoc, _id: nonExistingId });

  //     const pongoDoc = await pongoCollection.findOne({
  //       _id: nonExistingId,
  //     });

  //     assert.deepStrictEqual(pongoDoc, {
  //       ...newDoc,
  //       _id: nonExistingId,
  //       _version: 1n,
  //     });
  //   });
  // });
});
