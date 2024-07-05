import { Collection as MongoCollection, type Document } from 'mongodb';
import type { PongoDb } from '../main';
import { Collection } from './mongoCollection';

export class Db {
  constructor(private pongoDb: PongoDb) {}

  collection<T extends Document>(collectionName: string): MongoCollection<T> {
    return new Collection<T>(this.pongoDb.collection<T>(collectionName));
  }
}
