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
  pongoSchema,
  type ObjectId,
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
};

void describe('MongoDB Compatibility Tests', () => {
  let postgres: StartedPostgreSqlContainer;
  let postgresConnectionString: string;
  let client: PongoClient;

  let pongoDb: PongoDb;
  let users: PongoCollection<User>;

  const user: User = {
    _id: new Date().toISOString(),
    name: 'Anita',
    age: 25,
  };

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

  after(async () => {
    try {
      await client.close();
      await postgres.stop();
    } catch (error) {
      console.log(error);
    }
  });

  void describe('Insert Operations', () => {
    void it('should insert a document with id', async () => {
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
        _version: 1,
      });
    });
  });

  void it('should NOT insert a document with the same id as the existing document', async () => {
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
      _version: 1,
    });
  });

  void describe('Update Operations', () => {
    void it('should update a document', async () => {
      const pongoCollection = pongoDb.collection<User>('updateOne');
      const doc = { name: 'Roger', age: 30 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);

      const update = { $set: { age: 31 } };

      await pongoCollection.updateOne(
        { _id: pongoInsertResult.insertedId! },
        update,
      );

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.equal(pongoDoc?.age, 31);
      assert.deepStrictEqual(
        {
          name: pongoDoc!.name,
          age: pongoDoc!.age,
        },
        {
          name: 'Roger',
          age: 31,
        },
      );
    });
  });

  void describe('Replace Operations', () => {
    void it('should replace a document', async () => {
      const pongoCollection = pongoDb.collection<User>('updateOne');
      const doc = { name: 'Roger', age: 30 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);

      const replacement = { name: 'Not Roger', age: 100, tags: ['tag2'] };

      await pongoCollection.replaceOne(
        { _id: pongoInsertResult.insertedId! },
        replacement,
      );

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.strictEqual(pongoDoc?.name, replacement.name);
      assert.deepEqual(pongoDoc?.age, replacement.age);
      assert.deepEqual(pongoDoc?.tags, replacement.tags);
    });
  });

  void describe('Delete Operations', () => {
    void it('should delete a document from both PostgreSQL and MongoDB', async () => {
      const pongoCollection = pongoDb.collection<User>('testCollection');
      const doc = { name: 'Cruella', age: 35 };

      const pongoInsertResult = await pongoCollection.insertOne(doc);

      const { deletedCount } = await pongoCollection.deleteOne({
        _id: pongoInsertResult.insertedId!,
      });
      assert.equal(deletedCount, 1);

      const pongoDoc = await pongoCollection.findOne({
        _id: pongoInsertResult.insertedId!,
      });

      assert.strictEqual(pongoDoc, null);
    });
  });

  void describe('Handle Operations', () => {
    void it('should insert a new document if it does not exist', async () => {
      const pongoCollection = pongoDb.collection<User>('handleCollection');
      const nonExistingId = uuid() as unknown as ObjectId;

      const newDoc: User = { name: 'John', age: 25 };

      const handle = (_existing: User | null) => newDoc;

      const resultPongo = await pongoCollection.handle(nonExistingId, handle);
      assert.deepStrictEqual(resultPongo, { ...newDoc, _id: nonExistingId });

      const pongoDoc = await pongoCollection.findOne({
        _id: nonExistingId,
      });

      assert.deepStrictEqual(pongoDoc, {
        ...newDoc,
        _id: nonExistingId,
        _version: 1,
      });
    });
  });
});
