[![](https://dcbadge.vercel.app/api/server/fTpqUTMmVa?style=flat)](https://discord.gg/fTpqUTMmVa) [<img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" height="20px" />](https://www.linkedin.com/in/oskardudycz/) [![Github Sponsors](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&link=https://github.com/sponsors/oskardudycz/)](https://github.com/sponsors/oskardudycz/) [![blog](https://img.shields.io/badge/blog-event--driven.io-brightgreen)](https://event-driven.io/?utm_source=event_sourcing_nodejs) [![blog](https://img.shields.io/badge/%F0%9F%9A%80-Architecture%20Weekly-important)](https://www.architecture-weekly.com/?utm_source=event_sourcing_nodejs)

![](./src/docs/public/social.png)

# Pongo

Pongo - Mongo but on Postgres and with strong consistency benefits.

## Getting Started

Install Pongo as an npm module and save it to your package.json:

```bash
npm install @event-driven-io/pongo
```

Read also [introduction article on my blog](https://event-driven.io/en/introducting_pongo/) for more context.

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

const { insertedId } = await pongoCollection.insertOne(anita);
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

const { insertedId } = await pongoCollection.insertOne(anita);
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

## How does it work?

**Pongo treats PostgreSQL as a Document Database benefiting from JSONB support.** Unlike the plain text storage of the traditional JSON type, JSONB stores JSON data in a binary format. This simple change brings significant advantages in terms of performance and storage efficiency.

Pongo uses the following table structure for storing collections:

```sql
CREATE TABLE IF NOT EXISTS "YourCollectionName" (
    _id UUID PRIMARY KEY,
    data JSONB
)
```

**Essentially Pongo takes MongoDB api and translates it to the native PostgreSQL queries.** It is a similar concept to [Marten](https://martendb.io/) and AWS DocumentDB (see [here](https://www.enterprisedb.com/blog/documentdb-really-postgresql) or [there](https://news.ycombinator.com/item?id=18870397), they seem to be using Mongo syntactic sugar on top of AuroraDB with Postgres).

**E.g. the MongoDB update syntax:**

```typescript
const pongoCollection = pongoDb.collection<User>("users");

await pongoCollection.updateOne(
  { _id: someId },
  { $push: { tags: "character" } }
);
```

will be translated to:

```sql
UPDATE "users"
SET data = jsonb_set(data, '{tags}', (COALESCE(data->'tags', '[]'::jsonb) || to_jsonb('character')))
WHERE _id = '137ef052-e41c-428b-b606-1c8070a47eda';
```

**Or for query:**

```typescript
const result = await pongoCollection
  .find({ "address.history": { $elemMatch: { street: "Elm St" } } })
  .toArray();
```

will result in:

```sql
SELECT data
FROM "users"
WHERE jsonb_path_exists(
  data,
  '$.address.history[*] ? (@.street == "Elm St")'
);
```

### Storage

**The binary format of PostgreSQL JSONB means that data is pre-parsed, allowing faster read and write operations than text-based JSON.** You don't have to re-parse the data every time you query it, which saves processing time and improves overall performance. Additionally, JSONB supports advanced indexing options like GIN and GiST indexes, making searches within JSONB documents much quicker and more efficient.

Moreover, JSONB retains the flexibility of storing semi-structured data while allowing you to use PostgreSQL's robust querying capabilities. You can perform complex queries, joins, and transactions with JSONB data, just as you can with regular relational data.

**Contrary to common belief, JSON document data is structured.** JSON has structure, but it is not enforced for each document. We can easily extend the schema for our documents, even for specific ones, by adding new fields. We should also not fail if the field we expect to exist, but doesn't.

This flexibility, performance, and consistency combination makes PostgreSQL with JSONB a powerful tool. There are benchmarks showing that it can be even faster than MongoDB.

Check more in:

- [JSON Types Documentation](https://www.postgresql.org/docs/current/datatype-json.html)
- [JSON Functions and Operators](https://www.postgresql.org/docs/current/functions-json.html)
- [PostgreSQL, JSONB and GIN Indexes by](https://pganalyze.com/blog/gin-index#postgresql-jsonb-and-gin-indexes)
- [MongoDB vs PostgreSQL JSONB Benchmark](https://info.enterprisedb.com/rs/069-ALB-339/images/PostgreSQL_MongoDB_Benchmark-WhitepaperFinal.pdf)
- [How to JSON in PostgreSQL](https://ftisiot.net/postgresqljson/main/)

## Is Pongo an ORM?

It's not. It's focused on effective handling of the document data specifics. Node.js ORMs have capabilites to handle JSONB, e.g. DrizzleORM has a good support for that for basic operations. Yet, they're all but limited to querying, usually for advanced ones you need to fallback to JSONPath or JSONB functions (so raw SQL). As you saw above, this syntax is not super pleasant to deal with. That's why Pongo aims to do it for you.

## Is it production ready?

What's there it's safe to use, but it's far from being 100% compliant with MongoDB. Pongo is a fresh project, so some stuff can be missing.

Pongo is a community project, so once you find something, we encourage you to send us a GH issue or Pull Request extending the support or test coverage!
