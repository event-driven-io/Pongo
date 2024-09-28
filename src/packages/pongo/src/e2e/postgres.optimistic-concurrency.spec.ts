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

  // void describe('Update Operations', () => {
  //   void it('should update a document', async () => {
  //     const pongoCollection = pongoDb.collection<User>('updateOne');
  //     const doc = { name: 'Roger', age: 30 };

  //     const pongoInsertResult = await pongoCollection.insertOne(doc);

  //     const update = { $set: { age: 31 } };

  //     await pongoCollection.updateOne(
  //       { _id: pongoInsertResult.insertedId! },
  //       update,
  //     );

  //     const pongoDoc = await pongoCollection.findOne({
  //       _id: pongoInsertResult.insertedId!,
  //     });

  //     assert.equal(pongoDoc?.age, 31);
  //     assert.deepStrictEqual(
  //       {
  //         name: pongoDoc!.name,
  //         age: pongoDoc!.age,
  //       },
  //       {
  //         name: 'Roger',
  //         age: 31,
  //       },
  //     );
  //   });
  // });

  // void describe('Replace Operations', () => {
  //   void it('should replace a document', async () => {
  //     const pongoCollection = pongoDb.collection<User>('updateOne');
  //     const doc = { name: 'Roger', age: 30 };

  //     const pongoInsertResult = await pongoCollection.insertOne(doc);

  //     const replacement = { name: 'Not Roger', age: 100, tags: ['tag2'] };

  //     await pongoCollection.replaceOne(
  //       { _id: pongoInsertResult.insertedId! },
  //       replacement,
  //     );

  //     const pongoDoc = await pongoCollection.findOne({
  //       _id: pongoInsertResult.insertedId!,
  //     });

  //     assert.strictEqual(pongoDoc?.name, replacement.name);
  //     assert.deepEqual(pongoDoc?.age, replacement.age);
  //     assert.deepEqual(pongoDoc?.tags, replacement.tags);
  //   });
  // });

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
