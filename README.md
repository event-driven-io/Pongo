[![](https://dcbadge.vercel.app/api/server/fTpqUTMmVa?style=flat)](https://discord.gg/fTpqUTMmVa) [<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" height="20px" />](https://www.linkedin.com/in/oskardudycz/) [![Github Sponsors](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&link=https://github.com/sponsors/oskardudycz/)](https://github.com/sponsors/oskardudycz/) [![blog](https://img.shields.io/badge/blog-event--driven.io-brightgreen)](https://event-driven.io/?utm_source=event_sourcing_nodejs) [![blog](https://img.shields.io/badge/%F0%9F%9A%80-Architecture%20Weekly-important)](https://www.architecture-weekly.com/?utm_source=event_sourcing_nodejs)

![](./src/docs/public/social.png)

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

const { insertedId } = await pongoCollection.insertOne(alice);
const anitaId = insertedId;

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

const { insertedId } = await pongoCollection.insertOne(alice);
const anitaId = insertedId;

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
