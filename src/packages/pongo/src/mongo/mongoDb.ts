import {
  Collection as MongoCollection,
  ObjectId,
  type Document,
} from 'mongodb';
import type {
  DocumentHandler,
  HandleOptions,
  PongoDb,
  PongoHandleResult,
} from '../core';
import { Collection } from './mongoCollection';

export class Db {
  constructor(private pongoDb: PongoDb) {}

  get databaseName(): string {
    return this.pongoDb.databaseName;
  }

  collection<T extends Document>(
    collectionName: string,
  ): MongoCollection<T> & {
    handle(
      id: ObjectId,
      handle: DocumentHandler<T>,
      options?: HandleOptions,
    ): Promise<PongoHandleResult<T>>;
  } {
    return new Collection<T>(this.pongoDb.collection<T>(collectionName));
  }
}
