# Pongo

Pongo - MongoDB on Postgres with all strong consistency benefits

## Getting Started

Install Pongo as an npm module and save it to your package.json

```bash
npm install @event-driven-io/pongo
```

## Example

You can use Pongo syntax with explicit typing about supported syntax:

```ts
import { pongoClient } from "@event-driven-io/pongo";
import { v4 as uuid } from "uuid";

type User = { name: string; age: number };

const connectionString =
  "postgresql://dbuser:secretpassword@database.server.com:3211/mydb";

const pongoClient = pongoClient(postgresConnectionString);
const pongoDb = pongoClient.db();

const users = pongoDb.collection<User>("users");
const roger = { name: "Roger", age: 30 };
const anita = { name: "Anita", age: 25 };
const cruella = { _id: uuid(), name: "Cruella", age: 40 };

// Inserting
await pongoCollection.insertOne(roger);
await pongoCollection.insertOne(cruella);

let inserted = await pongoCollection.insertOne(alice);
const anitaId = inserted.insertedId;

// Updating
await users.updateOne({ _id: anitaId }, { $set: { age: 31 } });

// Deleting
await pongoCollection.deleteOne({ _id: cruella._id });

// Finding by Id
const anitaFromDb = await pongoCollection.findOne({ _id: anitaId });

// Finding more
const users = await pongoCollection.find({ age: { $lt: 40 } });
```

Or use MongoDB compliant shim:

```ts
import { MongoClient } from "@event-driven-io/pongo";
import { v4 as uuid } from "uuid";

type User = { name: string; age: number };

const connectionString =
  "postgresql://dbuser:secretpassword@database.server.com:3211/mydb";

const pongoClient = new MongoClient(postgresConnectionString);
const pongoDb = pongoClient.db();

const users = pongoDb.collection<User>("users");
const roger = { name: "Roger", age: 30 };
const anita = { name: "Anita", age: 25 };
const cruella = { _id: uuid(), name: "Cruella", age: 40 };

// Inserting
await pongoCollection.insertOne(roger);
await pongoCollection.insertOne(cruella);

let inserted = await pongoCollection.insertOne(alice);
const anitaId = inserted.insertedId;

// Updating
await users.updateOne({ _id: anitaId }, { $set: { age: 31 } });

// Deleting
await pongoCollection.deleteOne({ _id: cruella._id });

// Finding by Id
const anitaFromDb = await pongoCollection.findOne({ _id: anitaId });

// Finding more
const users = await pongoCollection.find({ age: { $lt: 40 } }).toArray();
```

## Is it production ready?

What's there it's safe to use, but it's far from being 100% compliant with MongoDB.
