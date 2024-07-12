import {
  Collection as MongoCollection,
  ObjectId,
  type Document,
} from 'mongodb';
import type { DocumentHandler, PongoDb } from '../main';
import { Collection } from './mongoCollection';

export class Db {
  constructor(private pongoDb: PongoDb) {}

  collection<T extends Document>(
    collectionName: string,
  ): MongoCollection<T> & {
    handle(id: ObjectId, handle: DocumentHandler<T>): Promise<T | null>;
  } {
    return new Collection<T>(this.pongoDb.collection<T>(collectionName));
  }
}
