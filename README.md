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

const pongoClient = pongoClient(connectionString);
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

**Essentially Pongo takes MongoDB api and translates it to the native PostgreSQL queries.** It is a similar concept to [Marten](https://martendb.io/), [FerretDB](https://docs.ferretdb.io) and [AWS DocumentDB](https://aws.amazon.com/documentdb/).

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

## Why Pongo?

MongoDB is a decent database, yet it has issues around [ACID-complaince](https://jepsen.io/analyses/mongodb-4.2.6) and [licensing](https://www.percona.com/blog/is-mongodb-open-source), which can cause hardship for project scenarios and organisation policies.

**Pongo brings the [PostgreSQL shape-shifting capabilities](https://www.amazingcto.com/postgres-for-everything/) to:**

- benefit from **strong consistency** by using battle-tested and widely used PostgreSQL ACID-compliant database,
- **easier integration** with other parts of your system using PostgreSQL,
- **reuse your muscle memory from MongoDB** using compatible API. It will allow easier migration of existing projects,
- **cut boilerplate** and easier nested data management than traditional relational tables,
- operate **easier than crafting native PostgreSQL JSON queries**. They're powerful but not the most accessible,
- get **performance boost** with [JSONB indexing capabilities](https://pganalyze.com/blog/gin-index#postgresql-jsonb-and-gin-indexes),
- **benefit from PostgreSQL advanced capabilities** like [partitioning](https://www.postgresql.fastware.com/postgresql-insider-prt-ove), [logical replication](https://event-driven.io/en/push_based_outbox_pattern_with_postgres_logical_replication/) and [other PostgreSQL superpowers](https://event-driven.io/en/postgres_superpowers/)
- **seamless integration with Cloud RDSes** and solutions like [CockroachDB](https://www.cockroachlabs.com/docs/stable/why-cockroachdb), [Supabase](https://supabase.com/), [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres).

## Storage

**The binary format of PostgreSQL JSONB means that data is pre-parsed, allowing faster read and write operations than text-based JSON.** You don't have to re-parse the data every time you query it, which saves processing time and improves overall performance. Additionally, JSONB supports advanced indexing options like GIN and GiST indexes, making searches within JSONB documents much quicker and more efficient.

Moreover, JSONB retains the flexibility of storing semi-structured data while allowing you to use PostgreSQL's robust querying capabilities. You can perform complex queries, joins, and transactions with JSONB data, just as you can with regular relational data.

**Contrary to common belief, JSON document data is structured.** JSON has structure, but it is not enforced for each document. We can easily extend the schema for our documents, even for specific ones, by adding new fields. We should also not fail if a field we expect to exist doesn't.

This flexibility, performance, and consistency combination makes PostgreSQL with JSONB a powerful tool. There are benchmarks showing that it can be even faster than MongoDB.

Check more in:

- [JSON Types Documentation](https://www.postgresql.org/docs/current/datatype-json.html)
- [JSON Functions and Operators](https://www.postgresql.org/docs/current/functions-json.html)
- [PostgreSQL, JSONB and GIN Indexes by](https://pganalyze.com/blog/gin-index#postgresql-jsonb-and-gin-indexes)
- [MongoDB vs PostgreSQL JSONB Benchmark](https://info.enterprisedb.com/rs/069-ALB-339/images/PostgreSQL_MongoDB_Benchmark-WhitepaperFinal.pdf)
- [How to JSON in PostgreSQL](https://ftisiot.net/postgresqljson/main/)
- [Just Use Postgres for Everything](https://www.amazingcto.com/postgres-for-everything/)

## Is Pongo an ORM?

**It's not.**

It's focused on effective handling of the document data specifics. Node.js ORMs have capabilities to handle JSONB, e.g. DrizzleORM has good support for that for basic operations.

**Yet, they all have limited querying capabilities.** Usually for advanced ones you need to fallback to JSONPath or JSONB functions (so raw SQL). As you saw above, this syntax is not super pleasant to deal with. That's why Pongo aims to do it for you.

## How is it different than [FerretDB](https://docs.ferretdb.io)?

[FerretDB](https://docs.ferretdb.io) plugs into the native MongoDB protocol, which allows it to be used as MongoDB and connect to tools like Mongo UI, etc. Yet, it [requires running a proxy](https://docs.ferretdb.io/quickstart-guide/docker/).

**Pongo operates on a different layer, translating the MongoDB API directly into SQL in the library code.** This can allow easier serverless integrations, such as sharing a connection pool with other PostgreSQL-based tools, etc. Of course, it won't allow using native tools based on the MongoDB network protocol.

Pongo's goal is not to replace Mongo but to reuse its muscle memory and bring the PostgreSQL capabilities and superpowers into the Node.js land.

## Is it production ready?

What's there is safe to use, but it's far from being 100% compliant with MongoDB. Pongo is a fresh project, so some stuff can be missing.

## Contribution

Pongo is a community project, so once you find something missing or not working, we encourage you to [send us a GH issue](https://github.com/event-driven-io/Pongo/issues/new) or [Pull Request](https://github.com/event-driven-io/Pongo/compare) extending the support or test coverage! Check also [Contributing guide](https://github.com/event-driven-io/Pongo/blob/main/CONTRIBUTING.md)

**If you think something is missing or want to get some features faster, I'm happy to take sponsoring to prioritise it. Feel free to [contact me](mailto:oskar@event-driven.io) - we'll find a way to help you!**

## Code of Conduct

This project has adopted the code of conduct defined by the [Contributor Covenant](http://contributor-covenant.org/) to clarify expected behavior in our community.
