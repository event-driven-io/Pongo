import { endAllPools, pongoClient } from '@event-driven-io/pongo';
import { v4 as uuid } from 'uuid';

type User = { name: string; age: number };

const connectionString =
  'postgresql://postgres:postgres@localhost:5432/postgres';

const pongo = pongoClient(connectionString);
const pongoDb = pongo.db();

const users = pongoDb.collection<User>('users');
const roger = { name: 'Roger', age: 30 };
const anita = { name: 'Anita', age: 25 };
const cruella = { _id: uuid(), name: 'Cruella', age: 40 };

// Inserting
await users.insertOne(roger);
await users.insertOne(cruella);

const { insertedId } = await users.insertOne(anita);
const anitaId = insertedId!;

// Updating
await users.updateOne({ _id: anitaId }, { $set: { age: 31 } });

// Deleting
await users.deleteOne({ _id: cruella._id });

// Finding by Id
const anitaFromDb = await users.findOne({ _id: anitaId });
console.log(JSON.stringify(anitaFromDb));

// Finding more
const usersFromDB = await users.find({ age: { $lt: 40 } });
console.log(JSON.stringify(usersFromDB));

await endAllPools();
