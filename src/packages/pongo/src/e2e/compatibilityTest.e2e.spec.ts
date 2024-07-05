import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import { Db as MongoDb, MongoClient as OriginalMongoClient } from 'mongodb';
import { after, before, describe, it } from 'node:test';
import { MongoClient, endAllPools, type Db } from '../';

type User = { name: string; age: number };

void describe('MongoDB Compatibility Tests', () => {
  let postgres: StartedPostgreSqlContainer;
  let postgresConnectionString: string;
  let pongoClient: MongoClient;

  let mongo: StartedMongoDBContainer;
  let mongoConnectionString: string;
  let mongoClient: OriginalMongoClient;

  let pongoDb: Db;
  let mongoDb: MongoDb;

  before(async () => {
    postgres = await new PostgreSqlContainer().start();
    postgresConnectionString = postgres.getConnectionUri();
    pongoClient = new MongoClient(postgresConnectionString);
    await pongoClient.connect();

    mongo = await new MongoDBContainer('mongo:6.0.12').start();
    mongoConnectionString = mongo.getConnectionString();
    mongoClient = new OriginalMongoClient(mongoConnectionString, {
      directConnection: true,
    });
    await mongoClient.connect();

    const dbName = postgres.getDatabase();

    pongoDb = pongoClient.db(dbName);
    mongoDb = mongoClient.db(dbName);
  });

  after(async () => {
    try {
      await endAllPools();
      await postgres.stop();
    } catch (error) {
      console.log(error);
    }
    try {
      await mongoClient.close();
      await mongo.stop();
    } catch (error) {
      console.log(error);
    }
  });

  void describe('Insert Operations', () => {
    void it('should insert a document into both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('testCollection');

      const doc = { name: 'Alice', age: 25 };

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
  });

  void describe('Update Operations', () => {
    void it('should update a document in both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('testCollection');
      const doc = { name: 'Bob', age: 30 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);

      const update = { $set: { age: 31 } };

      await pongoCollection.updateOne(
        { _id: pongoInsertResult.insertedId },
        update,
      );
      await mongoCollection.updateOne(
        { _id: mongoInsertResult.insertedId },
        update,
      );

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId,
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
  });

  void describe('Delete Operations', () => {
    void it('should delete a document from both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('testCollection');
      const doc = { name: 'Charlie', age: 35 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);
      const mongoInsertResult = await mongoCollection.insertOne(doc);

      await pongoCollection.deleteOne({ _id: pongoInsertResult.insertedId });
      await mongoCollection.deleteOne({ _id: mongoInsertResult.insertedId });

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId,
      });
      const mongoDoc = await mongoCollection.findOne({
        _id: mongoInsertResult.insertedId,
      });

      assert.strictEqual(pongoDoc, null);
      assert.strictEqual(mongoDoc, null);
    });
  });

  void describe('Find Operations', () => {
    void it('should find documents with a filter in both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('testCollection');
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

      const pongoDocs = await pongoCollection
        .find({ age: { $gte: 45 } })
        .toArray();
      const mongoDocs = await mongoCollection
        .find({ age: { $gte: 45 } })
        .toArray();

      assert.strictEqual(pongoDocs.length, 2);

      assert.deepStrictEqual(
        pongoDocs.map((d) => ({ name: d.name, age: d.age })),
        mongoDocs.map((d) => ({ name: d.name, age: d.age })),
      );
    });

    void it('should find one document with a filter in both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const mongoCollection = mongoDb.collection<User>('testCollection');
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
  });
});
