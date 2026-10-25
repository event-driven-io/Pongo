import { pongoCache, pongoClient, pongoSchema } from '@event-driven-io/pongo';
import { pongoDriver } from '@event-driven-io/pongo/cloudflare';
import { MongoClient } from '@event-driven-io/pongo/shim';

const users = pongoSchema.collection('users');
const schema = pongoSchema.client({
  browser: pongoSchema.db('browser', { collections: { users } }),
});
const options = {
  driver: pongoDriver,
  database: {},
  schema: { definition: schema, autoMigration: 'None' },
};
const client = pongoClient(options);
const shim = new MongoClient(options);
const cache = pongoCache({ type: 'in-memory', max: 2 });
cache.set('users:1', { _id: '1', name: 'Ada' });

window.pongoBrowser = {
  collectionName: client.db('browser').collection('users').collectionName,
  shimCollectionName: shim.db('browser').collection('users').collectionName,
  cachedDocument: await cache.get('users:1'),
  processType: typeof process,
  bufferType: typeof Buffer,
  requireType: typeof require,
};
