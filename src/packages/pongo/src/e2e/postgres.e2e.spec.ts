import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import console from 'console';
import { after, before, describe, it } from 'node:test';
import { v4 as uuid } from 'uuid';
import {
  pongoClient,
  type ObjectId,
  type PongoClient,
  type PongoDb,
} from '../';
import { pongoSchema } from '../core';
import { MongoClient, type Db } from '../shim';

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
};

void describe('MongoDB Compatibility Tests', () => {
  let postgres: StartedPostgreSqlContainer;
  let postgresConnectionString: string;
  let client: PongoClient;
  let shim: MongoClient;

  let pongoDb: PongoDb;
  let mongoDb: Db;

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    postgresConnectionString = postgres.getConnectionUri();
    client = pongoClient(postgresConnectionString, {
      schema: { autoMigration: 'None' },
    });
    shim = new MongoClient(postgresConnectionString);
    await client.connect();
    await shim.connect();

    const dbName = postgres.getDatabase();

    pongoDb = client.db(dbName);
    mongoDb = shim.db(dbName);
  });

  after(async () => {
    try {
      await client.close();
      await shim.close();
      //await endAllPools();
      await postgres.stop();
    } catch (error) {
      console.log(error);
    }
  });

  void describe('FindOne', () => {
    void it('should return null when does not exist', async () => {
      const pongoCollection = pongoDb.collection<User>('findOne');
      const mongoCollection = mongoDb.collection<User>('shimFindOne');
      const nonExistingId = uuid() as unknown as ObjectId;

      const pongoDoc = await pongoCollection.findOne({
        _id: nonExistingId,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: nonExistingId,
      });
      assert.equal(pongoDoc, null);
      assert.equal(mongoDoc, null);
    });
  });

  void describe('Insert Operations', () => {
    void it('should insert a document with id into both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('insertOne');
      const mongoCollection = mongoDb.collection<User>('shiminsertOne');
      const _id = new Date().toISOString();
      const doc: User = {
        _id: new Date().toISOString(),
        name: 'Anita',
        age: 25,
      };
      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);
      assert(pongoInsertResult.insertedId);
      assert(mongoInsertResult.insertedId);
      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });
      assert.ok(pongoDoc);
      assert.ok(mongoDoc);
      assert.deepStrictEqual(
        {
          name: pongoDoc.name,
          age: pongoDoc.age,
        },
        {
          name: mongoDoc.name,
          age: mongoDoc.age,
        },
      );
    });

    void it('should insert a document into both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('insertOne');
      const mongoCollection = mongoDb.collection<User>('shiminsertOne');
      const doc = { name: 'Anita', age: 25 };
      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);
      assert(pongoInsertResult.insertedId);
      assert(mongoInsertResult.insertedId);
      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });
      assert.deepStrictEqual(
        {
          name: pongoDoc!.name,
          age: pongoDoc!.age,
        },
        {
          name: mongoDoc!.name,
          age: mongoDoc!.age,
        },
      );
    });

    void it('should insert many documents into both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('insertMany');
      const mongoCollection = mongoDb.collection<User>('shiminsertMany');
      const docs = [
        { name: 'David', age: 40 },
        { name: 'Eve', age: 45 },
        { name: 'Frank', age: 50 },
      ];
      const pongoInsertResult = await pongoCollection.insertMany(docs);
      const mongoInsertResult = await mongoCollection.insertMany(docs);
      const pongoIds = Object.values(pongoInsertResult.insertedIds);
      const mongoIds = Object.values(mongoInsertResult.insertedIds);
      assert.equal(pongoInsertResult.insertedCount, docs.length);
      assert.equal(mongoInsertResult.insertedCount, docs.length);
      const pongoDocs = await pongoCollection.find({
        _id: { $in: pongoIds },
      });
      const mongoDocs = await mongoCollection
        .find({
          _id: { $in: mongoIds },
        })
        .toArray();
      assert.deepStrictEqual(
        pongoDocs.map((doc) => ({
          name: doc.name,
          age: doc.age,
        })),
        mongoDocs.map((doc) => ({
          name: doc.name,
          age: doc.age,
        })),
      );
    });
  });

  void describe('Update Operations', () => {
    void it('should update a document', async () => {
      const pongoCollection = pongoDb.collection<User>('updateOne');
      const mongoCollection = mongoDb.collection<User>('shimupdateOne');
      const doc = { name: 'Roger', age: 30 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);

      const update = { $set: { age: 31 } };

      await pongoCollection.updateOne(
        { _id: pongoInsertResult.insertedId! },
        update,
      );
      await mongoCollection.updateOne(
        { _id: mongoInsertResult.insertedId },
        update,
      );

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });

      assert.equal(mongoDoc?.age, 31);
      assert.deepStrictEqual(
        {
          name: pongoDoc!.name,
          age: pongoDoc!.age,
        },
        {
          name: mongoDoc!.name,
          age: mongoDoc!.age,
        },
      );
    });

    void it('should update a multiple properties in document', async () => {
      const pongoCollection = pongoDb.collection<User>('updateOneMultiple');
      const mongoCollection = mongoDb.collection<User>('shimupdateOneMultiple');
      const doc = { name: 'Roger', age: 30 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);

      const update = { $set: { age: 31, tags: [] } };

      await pongoCollection.updateOne(
        { _id: pongoInsertResult.insertedId! },
        update,
      );
      await mongoCollection.updateOne(
        { _id: mongoInsertResult.insertedId },
        update,
      );

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });

      assert.equal(mongoDoc?.age, 31);
      assert.deepEqual(mongoDoc?.tags, []);
      assert.deepStrictEqual(
        {
          name: pongoDoc!.name,
          age: pongoDoc!.age,
          tags: pongoDoc!.tags,
        },
        {
          name: mongoDoc!.name,
          age: mongoDoc!.age,
          tags: mongoDoc!.tags,
        },
      );
    });

    void it('should update documents', async () => {
      const pongoCollection = pongoDb.collection<User>('updateMany');
      const mongoCollection = mongoDb.collection<User>('shimupdateMany');

      const docs = [
        { name: 'David', age: 40 },
        { name: 'Eve', age: 45 },
        { name: 'Frank', age: 50 },
      ];

      const pongoInsertResult = await pongoCollection.insertMany(docs);
      const mongoInsertResult = await mongoCollection.insertMany(docs);

      const pongoIds = Object.values(pongoInsertResult.insertedIds);
      const mongoIds = Object.values(mongoInsertResult.insertedIds);

      const update = { $set: { age: 31 } };

      const pongoUpdateResult = await pongoCollection.updateMany(
        { _id: { $in: pongoIds } },
        update,
      );
      const mongoUpdateResult = await mongoCollection.updateMany(
        { _id: { $in: mongoIds } },
        update,
      );

      assert.equal(3, pongoUpdateResult.modifiedCount);
      assert.equal(3, mongoUpdateResult.modifiedCount);

      const pongoDocs = await pongoCollection.find({
        _id: { $in: pongoIds },
      });
      const mongoDocs = await mongoCollection
        .find({
          _id: { $in: mongoIds },
        })
        .toArray();

      assert.deepStrictEqual(
        pongoDocs.map((doc) => ({
          name: doc.name,
          age: doc.age,
        })),
        mongoDocs.map((doc) => ({
          name: doc.name,
          age: doc.age,
        })),
      );
    });

    void it('should update a document using $unset', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('shimtestCollection');
      const doc = { name: 'Roger', age: 30, address: { city: 'Wonderland' } };

      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);

      const { modifiedCount } = await pongoCollection.updateOne(
        { _id: pongoInsertResult.insertedId! },
        { $unset: { address: '' } },
      );
      assert.equal(modifiedCount, 1);
      await mongoCollection.updateOne(
        { _id: mongoInsertResult.insertedId },
        { $unset: { address: '' } },
      );

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });

      assert.deepStrictEqual(
        {
          name: pongoDoc!.name,
          age: pongoDoc!.age,
          address: undefined,
        },
        {
          name: mongoDoc!.name,
          age: mongoDoc!.age,
          address: undefined,
        },
      );
    });

    void it('should update a document using $inc', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('shimtestCollection');
      const doc = { name: 'Roger', age: 30 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);

      const update = { $inc: { age: 1 } };

      const { modifiedCount } = await pongoCollection.updateOne(
        { _id: pongoInsertResult.insertedId! },
        update,
      );
      assert.equal(modifiedCount, 1);
      await mongoCollection.updateOne(
        { _id: mongoInsertResult.insertedId },
        update,
      );

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });

      assert.deepStrictEqual(
        {
          name: pongoDoc!.name,
          age: 31,
        },
        {
          name: mongoDoc!.name,
          age: 31,
        },
      );
    });

    void it('should update a document using $push', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('shimtestCollection');
      const doc = { name: 'Roger', age: 30 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);
      let pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      // Push to non existing
      let updateResult = await pongoCollection.updateOne(
        { _id: pongoInsertResult.insertedId! },
        //TODO: fix $push type definition to allow non-array
        { $push: { tags: 'tag1' as unknown as string[] } },
      );
      assert.equal(updateResult.modifiedCount, 1);
      await mongoCollection.updateOne(
        { _id: mongoInsertResult.insertedId },
        { $push: { tags: 'tag1' } },
      );
      pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      // Push to existing
      updateResult = await pongoCollection.updateOne(
        { _id: pongoInsertResult.insertedId! },
        { $push: { tags: 'tag2' as unknown as string[] } },
      );
      assert.equal(updateResult.modifiedCount, 1);
      await mongoCollection.updateOne(
        { _id: mongoInsertResult.insertedId },
        { $push: { tags: 'tag2' } },
      );

      pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });

      assert.deepStrictEqual(
        {
          name: pongoDoc!.name,
          age: pongoDoc!.age,
          tags: ['tag1', 'tag2'],
        },
        {
          name: mongoDoc!.name,
          age: mongoDoc!.age,
          tags: ['tag1', 'tag2'],
        },
      );
    });
  });

  void describe('Replace Operations', () => {
    void it('should replace a document', async () => {
      const pongoCollection = pongoDb.collection<User>('updateOne');
      const mongoCollection = mongoDb.collection<User>('shimupdateOne');
      const doc = { name: 'Roger', age: 30 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);

      const replacement = { name: 'Not Roger', age: 100, tags: ['tag2'] };

      await pongoCollection.replaceOne(
        { _id: pongoInsertResult.insertedId! },
        replacement,
      );
      await mongoCollection.replaceOne(
        { _id: mongoInsertResult.insertedId },
        replacement,
      );

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });

      assert.strictEqual(mongoDoc?.name, replacement.name);
      assert.deepEqual(mongoDoc?.age, replacement.age);
      assert.deepEqual(mongoDoc?.tags, replacement.tags);
      assert.deepStrictEqual(
        {
          name: pongoDoc!.name,
          age: pongoDoc!.age,
          tags: pongoDoc!.tags,
        },
        {
          name: mongoDoc.name,
          age: mongoDoc.age,
          tags: mongoDoc.tags,
        },
      );
    });
  });

  void describe('Delete Operations', () => {
    void it('should delete a document from both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('shimtestCollection');
      const doc = { name: 'Cruella', age: 35 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);

      const { deletedCount } = await pongoCollection.deleteOne({
        _id: pongoInsertResult.insertedId!,
      });
      assert.equal(deletedCount, 1);
      await mongoCollection.deleteOne({ _id: mongoInsertResult.insertedId });

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });

      assert.strictEqual(pongoDoc, null);
      assert.strictEqual(mongoDoc, null);
    });

    void it('should delete documents', async () => {
      const pongoCollection = pongoDb.collection<User>('updateMany');
      const mongoCollection = mongoDb.collection<User>('shimupdateMany');

      const docs = [
        { name: 'David', age: 40 },
        { name: 'Eve', age: 45 },
        { name: 'Frank', age: 50 },
      ];

      const pongoInsertResult = await pongoCollection.insertMany(docs);
      const mongoInsertResult = await mongoCollection.insertMany(docs);

      const pongoIds = Object.values(pongoInsertResult.insertedIds);
      const mongoIds = Object.values(mongoInsertResult.insertedIds);

      const pongoDeleteResult = await pongoCollection.deleteMany({
        _id: { $in: pongoIds },
      });
      const mongoUpdateResult = await mongoCollection.deleteMany({
        _id: { $in: mongoIds },
      });

      assert.equal(3, pongoDeleteResult.deletedCount);
      assert.equal(3, mongoUpdateResult.deletedCount);

      const pongoDocs = await pongoCollection.find({
        _id: { $in: pongoIds },
      });
      const mongoDocs = await mongoCollection
        .find({
          _id: { $in: mongoIds },
        })
        .toArray();

      assert.equal(0, pongoDocs.length);
      assert.equal(0, mongoDocs.length);

      assert.deepStrictEqual(
        pongoDocs.map((doc) => ({
          name: doc.name,
          age: 31,
        })),
        mongoDocs.map((doc) => ({
          name: doc.name,
          age: 31,
        })),
      );
    });

    void it('should delete documents in transaction', async () => {
      const docs = [
        { name: 'David', age: 40 },
        { name: 'Eve', age: 45 },
        { name: 'Frank', age: 50 },
      ];

      await client.withSession((session) =>
        session.withTransaction(async () => {
          const pongoCollection = pongoDb.collection<User>('updateMany');

          const pongoInsertResult = await pongoCollection.insertMany(docs, {
            session,
          });
          const pongoIds = Object.values(pongoInsertResult.insertedIds);

          const pongoDeleteResult = await pongoCollection.deleteMany(
            {
              _id: { $in: pongoIds },
            },
            {
              session,
            },
          );

          assert.equal(3, pongoDeleteResult.deletedCount);

          const pongoDocs = await pongoCollection.find(
            {
              _id: { $in: pongoIds },
            },
            {
              session,
            },
          );
          assert.equal(0, pongoDocs.length);
        }),
      );
      await shim.withSession((session) =>
        session.withTransaction(async () => {
          const mongoCollection = mongoDb.collection<User>('updateMany');

          const mongoInsertResult = await mongoCollection.insertMany(docs, {
            session,
          });
          const mongoIds = Object.values(mongoInsertResult.insertedIds);

          const mongoUpdateResult = await mongoCollection.deleteMany(
            {
              _id: { $in: mongoIds },
            },
            {
              session,
            },
          );

          assert.equal(3, mongoUpdateResult.deletedCount);

          const mongoDocs = await mongoCollection
            .find(
              {
                _id: { $in: mongoIds },
              },
              {
                session,
              },
            )
            .toArray();

          assert.equal(0, mongoDocs.length);
        }),
      );
    });
  });

  void describe('Find Operations', () => {
    void it('should find documents with a filter', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('shimtestCollection');
      const docs = [
        { name: 'David', age: 40 },
        { name: 'Eve', age: 45 },
        { name: 'Frank', age: 50 },
      ];

      await pongoCollection.insertOne(docs[0]!);
      await pongoCollection.insertOne(docs[1]!);
      await pongoCollection.insertOne(docs[2]!);

      await mongoCollection.insertOne(docs[0]!);
      await mongoCollection.insertOne(docs[1]!);
      await mongoCollection.insertOne(docs[2]!);

      const pongoDocs = await pongoCollection.find({ age: { $gte: 45 } });
      const mongoDocs = await mongoCollection
        .find({ age: { $gte: 45 } })
        .toArray();

      assert.strictEqual(pongoDocs.length, 2);

      assert.deepStrictEqual(
        pongoDocs.map((d) => ({ name: d.name, age: d.age })),
        mongoDocs.map((d) => ({ name: d.name, age: d.age })),
      );
    });

    void it('should find one document with a filter', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('shimtestCollection');
      const doc = { name: 'Grace', age: 55 };

      await pongoCollection.insertOne(doc);
      await mongoCollection.insertOne(doc);

      const pongoDoc = await pongoCollection.findOne({ name: 'Grace' });
      const mongoDoc = await mongoCollection.findOne({ name: 'Grace' });

      assert.deepStrictEqual(
        {
          name: pongoDoc!.name,
          age: pongoDoc!.age,
        },
        {
          name: mongoDoc!.name,
          age: mongoDoc!.age,
        },
      );
    });

    void it.skip('should find documents with a nested property filter', async () => {
      const pongoCollection = pongoDb.collection<User>(
        'findWithNestedProperty',
      );
      const mongoCollection = mongoDb.collection<User>(
        'shimfindWithNestedProperty',
      );

      const docs = [
        {
          name: 'David',
          age: 40,
          address: { city: 'Dreamland', zip: '12345' },
        },
        { name: 'Eve', age: 45, address: { city: 'Wonderland', zip: '67890' } },
        {
          name: 'Frank',
          age: 50,
          address: { city: 'Nightmare', zip: '54321' },
        },
      ];

      await pongoCollection.insertOne(docs[0]!);
      await pongoCollection.insertOne(docs[1]!);
      await pongoCollection.insertOne(docs[2]!);

      await mongoCollection.insertOne(docs[0]!);
      await mongoCollection.insertOne(docs[1]!);
      await mongoCollection.insertOne(docs[2]!);

      const pongoDocs = await pongoCollection.find({
        // TODO: fix filter typing
        //'address.city': 'Wonderland',
      });
      const mongoDocs = await mongoCollection
        .find({ 'address.city': 'Wonderland' })
        .toArray();

      assert.deepStrictEqual(
        pongoDocs.map((d) => ({
          name: d.name,
          age: d.age,
          address: d.address,
        })),
        mongoDocs.map((d) => ({
          name: d.name,
          age: d.age,
          address: d.address,
        })),
      );
    });

    void it.skip('should find documents with multiple nested property filters', async () => {
      const pongoCollection = pongoDb.collection<User>(
        'findWithMultipleNestedProperties',
      );
      const mongoCollection = mongoDb.collection<User>(
        'shimfindWithMultipleNestedProperties',
      );

      const docs = [
        {
          name: 'Anita',
          age: 25,
          address: { city: 'Wonderland', street: 'Main St' },
        },
        {
          name: 'Roger',
          age: 30,
          address: { city: 'Wonderland', street: 'Elm St' },
        },
        {
          name: 'Cruella',
          age: 35,
          address: { city: 'Dreamland', street: 'Oak St' },
        },
      ];

      await pongoCollection.insertOne(docs[0]!);
      await pongoCollection.insertOne(docs[1]!);
      await pongoCollection.insertOne(docs[2]!);

      await mongoCollection.insertOne(docs[0]!);
      await mongoCollection.insertOne(docs[1]!);
      await mongoCollection.insertOne(docs[2]!);

      const pongoDocs = await pongoCollection.find({
        // TODO: fix filter typing
        //'address.city': 'Wonderland',
        //'address.street': 'Elm St',
      });
      const mongoDocs = await mongoCollection
        .find({ 'address.city': 'Wonderland', 'address.street': 'Elm St' })
        .toArray();

      assert.deepStrictEqual(
        pongoDocs.map((d) => ({
          name: d.name,
          age: d.age,
          address: d.address,
        })),
        mongoDocs.map((d) => ({
          name: d.name,
          age: d.age,
          address: d.address,
        })),
      );
    });

    void it('should find documents with multiple nested property object filters', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('shimtestCollection');

      const docs = [
        {
          name: 'Anita',
          age: 25,
          address: { city: 'Wonderland', street: 'Main St' },
        },
        {
          name: 'Roger',
          age: 30,
          address: { city: 'Wonderland', street: 'Elm St' },
        },
        {
          name: 'Cruella',
          age: 35,
          address: { city: 'Dreamland', street: 'Oak St' },
        },
      ];

      await pongoCollection.insertOne(docs[0]!);
      await pongoCollection.insertOne(docs[1]!);
      await pongoCollection.insertOne(docs[2]!);

      await mongoCollection.insertOne(docs[0]!);
      await mongoCollection.insertOne(docs[1]!);
      await mongoCollection.insertOne(docs[2]!);

      //const pongoDocs: User[] = [];
      const pongoDocs = await pongoCollection.find({
        address: { city: 'Wonderland', street: 'Elm St' },
      });
      const mongoDocs = await mongoCollection
        .find({ address: { city: 'Wonderland', street: 'Elm St' } })
        .toArray();

      assert.deepStrictEqual(
        pongoDocs.map((d) => ({
          name: d.name,
          age: d.age,
          address: d.address,
        })),
        mongoDocs.map((d) => ({
          name: d.name,
          age: d.age,
          address: d.address,
        })),
      );
    });

    void it('should find documents with an array filter', async () => {
      const pongoCollection = pongoDb.collection<User>('findWithArrayFilter');
      const mongoCollection = mongoDb.collection<User>(
        'shimfindWithArrayFilter',
      );

      const docs = [
        { name: 'Anita', age: 25, tags: ['tag1', 'tag2'] },
        { name: 'Roger', age: 30, tags: ['tag2', 'tag3'] },
        { name: 'Cruella', age: 35, tags: ['tag1', 'tag3'] },
      ];

      await pongoCollection.insertOne(docs[0]!);
      await pongoCollection.insertOne(docs[1]!);
      await pongoCollection.insertOne(docs[2]!);

      await mongoCollection.insertOne(docs[0]!);
      await mongoCollection.insertOne(docs[1]!);
      await mongoCollection.insertOne(docs[2]!);

      const pongoDocs = await pongoCollection.find({
        tags: 'tag1',
      });
      const mongoDocs = await mongoCollection.find({ tags: 'tag1' }).toArray();

      assert.deepStrictEqual(
        pongoDocs.map((d) => ({ name: d.name, age: d.age, tags: d.tags })),
        mongoDocs.map((d) => ({ name: d.name, age: d.age, tags: d.tags })),
      );
    });

    void it('should find documents with multiple array filters', async () => {
      const pongoCollection = pongoDb.collection<User>(
        'findWithMultipleArrayFilters',
      );
      const mongoCollection = mongoDb.collection<User>(
        'shimfindWithMultipleArrayFilters',
      );

      const docs = [
        { name: 'Anita', age: 25, tags: ['tag1', 'tag2'] },
        { name: 'Roger', age: 30, tags: ['tag2', 'tag3'] },
        { name: 'Cruella', age: 35, tags: ['tag1', 'tag3'] },
      ];

      await pongoCollection.insertOne(docs[0]!);
      await pongoCollection.insertOne(docs[1]!);
      await pongoCollection.insertOne(docs[2]!);

      await mongoCollection.insertOne(docs[0]!);
      await mongoCollection.insertOne(docs[1]!);
      await mongoCollection.insertOne(docs[2]!);

      const pongoDocs = await pongoCollection.find({
        tags: { $all: ['tag1', 'tag2'] },
      });
      const mongoDocs = await mongoCollection
        .find({ tags: { $all: ['tag1', 'tag2'] } })
        .toArray();

      assert.deepStrictEqual(
        pongoDocs.map((d) => ({ name: d.name, age: d.age, tags: d.tags })),
        mongoDocs.map((d) => ({ name: d.name, age: d.age, tags: d.tags })),
      );
    });

    void it.skip('should find documents with an array element match filter', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('shimtestCollection');

      const docs = [
        { name: 'Anita', age: 25, tags: ['tag1', 'tag2'] },
        { name: 'Roger', age: 30, tags: ['tag2', 'tag3'] },
        { name: 'Cruella', age: 35, tags: ['tag1', 'tag3'] },
      ];

      await pongoCollection.insertOne(docs[0]!);
      await pongoCollection.insertOne(docs[1]!);
      await pongoCollection.insertOne(docs[2]!);

      await mongoCollection.insertOne(docs[0]!);
      await mongoCollection.insertOne(docs[1]!);
      await mongoCollection.insertOne(docs[2]!);

      const pongoDocs = await pongoCollection.find({
        tags: { $elemMatch: { $eq: 'tag1' } },
      });
      const mongoDocs = await mongoCollection
        .find({ tags: { $elemMatch: { $eq: 'tag1' } } })
        .toArray();

      assert.deepStrictEqual(
        pongoDocs.map((d) => ({ name: d.name, age: d.age, tags: d.tags })),
        mongoDocs.map((d) => ({ name: d.name, age: d.age, tags: d.tags })),
      );
    });

    void it.skip('should find documents with a nested array element match filter', async () => {
      const pongoCollection = pongoDb.collection<User>(
        'findWithElemMatchFilter',
      );
      const mongoCollection = mongoDb.collection<User>(
        'shimfindWithElemMatchFilter',
      );

      const docs = [
        {
          name: 'Anita',
          age: 25,
          address: {
            city: 'Wonderland',
            zip: '12345',
            history: [{ street: 'Main St' }, { street: 'Elm St' }],
          },
        },
        {
          name: 'Roger',
          age: 30,
          address: {
            city: 'Wonderland',
            zip: '67890',
            history: [{ street: 'Main St' }, { street: 'Oak St' }],
          },
        },
        {
          name: 'Cruella',
          age: 35,
          address: {
            city: 'Dreamland',
            zip: '54321',
            history: [{ street: 'Elm St' }],
          },
        },
      ];

      await pongoCollection.insertOne(docs[0]!);
      await pongoCollection.insertOne(docs[1]!);
      await pongoCollection.insertOne(docs[2]!);

      await mongoCollection.insertOne(docs[0]!);
      await mongoCollection.insertOne(docs[1]!);
      await mongoCollection.insertOne(docs[2]!);

      const pongoDocs = await pongoCollection.find({
        // TODO: fix filter typing
        //'address.history': { $elemMatch: { street: 'Elm St' } },
      });
      const mongoDocs = await mongoCollection
        .find({ 'address.history': { $elemMatch: { street: 'Elm St' } } })
        .toArray();

      assert.deepStrictEqual(
        pongoDocs.map((d) => ({
          name: d.name,
          age: d.age,
          address: d.address,
        })),
        mongoDocs.map((d) => ({
          name: d.name,
          age: d.age,
          address: d.address,
        })),
      );
    });
  });

  void describe('Handle Operations', () => {
    void it('should insert a new document if it does not exist', async () => {
      const pongoCollection = pongoDb.collection<User>('handleCollection');
      const nonExistingId = uuid() as unknown as ObjectId;

      const newDoc: User = { name: 'John', age: 25 };

      const handle = (_existing: User | null) => newDoc;

      const resultPongo = await pongoCollection.handle(nonExistingId, handle);
      assert(resultPongo.successful);
      assert.deepStrictEqual(resultPongo.document, {
        ...newDoc,
        _id: nonExistingId,
        _version: 1n,
      });

      const pongoDoc = await pongoCollection.findOne({
        _id: nonExistingId,
      });

      assert.deepStrictEqual(pongoDoc, {
        ...newDoc,
        _id: nonExistingId,
        _version: 1n,
      });
    });

    void it('should replace an existing document', async () => {
      const pongoCollection = pongoDb.collection<User>('handleCollection');

      const existingDoc: User = { name: 'John', age: 25 };
      const updatedDoc: User = { name: 'John', age: 30 };

      const pongoInsertResult = await pongoCollection.insertOne(existingDoc);

      const handle = (_existing: User | null) => updatedDoc;

      const resultPongo = await pongoCollection.handle(
        pongoInsertResult.insertedId!,
        handle,
      );

      assert(resultPongo.successful);
      assert.deepStrictEqual(resultPongo.document, {
        ...updatedDoc,
        _version: 2n,
      });

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.deepStrictEqual(pongoDoc, {
        ...updatedDoc,
        _id: pongoInsertResult.insertedId,
        _version: 2n,
      });
    });

    void it('should delete an existing document if the handler returns null', async () => {
      const pongoCollection = pongoDb.collection<User>('handleCollection');

      const existingDoc: User = { name: 'John', age: 25 };

      const pongoInsertResult = await pongoCollection.insertOne(existingDoc);

      const handle = (_existing: User | null) => null;

      const resultPongo = await pongoCollection.handle(
        pongoInsertResult.insertedId!,
        handle,
      );
      assert(resultPongo.successful);

      assert.strictEqual(resultPongo.document, null);

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.strictEqual(pongoDoc, null);
    });

    void it('should do nothing if the handler returns the existing document unchanged', async () => {
      const pongoCollection = pongoDb.collection<User>('handleCollection');

      const existingDoc: User = { name: 'John', age: 25 };

      const pongoInsertResult = await pongoCollection.insertOne(existingDoc);

      const handle = (existing: User | null) => existing;

      const resultPongo = await pongoCollection.handle(
        pongoInsertResult.insertedId!,
        handle,
      );

      assert(resultPongo.successful);
      assert.deepStrictEqual(resultPongo.document, {
        ...existingDoc,
        _id: pongoInsertResult.insertedId,
        _version: 1n,
      });

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.deepStrictEqual(pongoDoc, {
        ...existingDoc,
        _id: pongoInsertResult.insertedId,
        _version: 1n,
      });
    });
  });

  void describe('No filter', () => {
    void it('should filter and count without filter specified', async () => {
      const pongoCollection = pongoDb.collection<User>('nofilter');

      const newDoc: User = { name: 'John', age: 25 };
      await pongoCollection.insertOne(newDoc);

      const user = await pongoCollection.findOne();

      assert.ok(user);

      const count = await pongoCollection.countDocuments();
      assert.ok(count >= 1);
    });
  });

  void describe('Pongo Schema', () => {
    const schema = pongoSchema.client({
      database: pongoSchema.db({
        users: pongoSchema.collection<User>('users'),
      }),
    });

    void it('should access typed collection and perform operation', async () => {
      const typedClient = pongoClient(postgresConnectionString, {
        schema: { definition: schema },
      });
      try {
        const users = typedClient.database.users;

        const _id = new Date().toISOString();
        const doc: User = {
          _id,
          name: 'Anita',
          age: 25,
        };
        const pongoInsertResult = await users.insertOne(doc);
        assert(pongoInsertResult.insertedId);

        const pongoDoc = await users.findOne({
          _id: pongoInsertResult.insertedId,
        });
        assert.ok(pongoDoc);
      } finally {
        await typedClient.close();
      }
    });

    void it('should access collection by name and perform operation', async () => {
      const typedClient = pongoClient(postgresConnectionString, {
        schema: { definition: schema },
      });
      try {
        const users = typedClient.database.collection<User>('users');

        const _id = new Date().toISOString();
        const doc: User = {
          _id,
          name: 'Anita',
          age: 25,
        };
        const pongoInsertResult = await users.insertOne(doc);
        assert(pongoInsertResult.insertedId);

        const pongoDoc = await users.findOne({
          _id: pongoInsertResult.insertedId,
        });
        assert.ok(pongoDoc);
      } finally {
        await typedClient.close();
      }
    });
  });
});
