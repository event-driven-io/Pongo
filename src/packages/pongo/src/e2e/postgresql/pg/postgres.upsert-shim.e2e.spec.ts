import { PostgreSQLConnectionString } from '@event-driven-io/dumbo/pg';
import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import assert from 'assert';
import type { Db as MongoDb, ObjectId } from 'mongodb';
import { MongoClient as OriginalMongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { pgDriver, usePgPongoDriver } from '../../../pg';
import { MongoClient, type Db } from '../../../shim';

type User = {
  _id?: ObjectId;
  name: string;
  age: number;
};

describe('Upsert Shim Parity Tests', () => {
  let postgres: StartedPostgreSqlContainer;
  let postgresConnectionString: PostgreSQLConnectionString;
  let pongoClient: MongoClient;

  let mongo: StartedMongoDBContainer;
  let mongoConnectionString: string;
  let mongoClient: OriginalMongoClient;

  let pongoDb: Db;
  let mongoDb: MongoDb;

  beforeAll(async () => {
    usePgPongoDriver();

    postgres = await new PostgreSqlContainer('postgres:18.0').start();
    postgresConnectionString = PostgreSQLConnectionString(
      postgres.getConnectionUri(),
    );
    pongoClient = new MongoClient({
      driver: pgDriver,
      connectionString: postgresConnectionString,
    });
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

  afterAll(async () => {
    try {
      await pongoClient.close();
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

  describe('replaceOne with upsert', () => {
    it('inserting returns upsert counts matching MongoDB shape', async () => {
      const pongoCollection = pongoDb.collection<User>('replaceUpsertInsert');
      const mongoCollection = mongoDb.collection<User>('replaceUpsertInsert');

      const doc = { name: 'Anita', age: 25 };

      const pongoResult = await pongoCollection.replaceOne(
        { name: 'Anita' },
        doc,
        { upsert: true },
      );
      const mongoResult = await mongoCollection.replaceOne(
        { name: 'Anita' },
        doc,
        { upsert: true },
      );

      assert(pongoResult.upsertedId !== null);
      assert(pongoResult.upsertedCount === 1);
      assert(pongoResult.matchedCount === 0);
      assert(pongoResult.modifiedCount === 0);

      assert(mongoResult.upsertedId !== null);
      assert.strictEqual(pongoResult.upsertedCount, mongoResult.upsertedCount);
      assert.strictEqual(pongoResult.matchedCount, mongoResult.matchedCount);
      assert.strictEqual(pongoResult.modifiedCount, mongoResult.modifiedCount);
    });

    it('replacing returns null upsertedId matching MongoDB shape', async () => {
      const pongoCollection = pongoDb.collection<User>('replaceUpsertReplace');
      const mongoCollection = mongoDb.collection<User>('replaceUpsertReplace');

      const doc = { name: 'Roger', age: 30 };
      const pongoInsert = await pongoCollection.insertOne(doc);
      const mongoInsert = await mongoCollection.insertOne(doc);

      const replacement = { name: 'Roger', age: 31 };
      const pongoResult = await pongoCollection.replaceOne(
        { _id: pongoInsert.insertedId },
        replacement,
        { upsert: true },
      );
      const mongoResult = await mongoCollection.replaceOne(
        { _id: mongoInsert.insertedId },
        replacement,
        { upsert: true },
      );

      assert(pongoResult.upsertedId === null);
      assert(pongoResult.upsertedCount === 0);
      assert(pongoResult.matchedCount === 1);
      assert(pongoResult.modifiedCount === 1);

      assert(mongoResult.upsertedId === null);
      assert.strictEqual(pongoResult.upsertedCount, mongoResult.upsertedCount);
      assert.strictEqual(pongoResult.matchedCount, mongoResult.matchedCount);
      assert.strictEqual(pongoResult.modifiedCount, mongoResult.modifiedCount);
    });
  });

  describe('updateOne without upsert', () => {
    it('maps to upsertedCount 0 and null upsertedId with correct matchedCount', async () => {
      const pongoCollection = pongoDb.collection<User>('updateOneNoUpsert');
      const mongoCollection = mongoDb.collection<User>('updateOneNoUpsert');

      const doc = { name: 'Grace', age: 55 };
      const pongoInsert = await pongoCollection.insertOne(doc);
      const mongoInsert = await mongoCollection.insertOne(doc);

      const update = { $set: { age: 56 } };
      const pongoResult = await pongoCollection.updateOne(
        { _id: pongoInsert.insertedId },
        update,
      );
      const mongoResult = await mongoCollection.updateOne(
        { _id: mongoInsert.insertedId },
        update,
      );

      assert(pongoResult.upsertedCount === 0);
      assert(pongoResult.upsertedId === null);
      assert(pongoResult.matchedCount === 1);
      assert(pongoResult.modifiedCount === 1);

      assert.strictEqual(pongoResult.matchedCount, mongoResult.matchedCount);
      assert.strictEqual(pongoResult.modifiedCount, mongoResult.modifiedCount);
      assert.strictEqual(pongoResult.upsertedCount, mongoResult.upsertedCount);
      assert.strictEqual(pongoResult.upsertedId, mongoResult.upsertedId);
    });
  });
});
