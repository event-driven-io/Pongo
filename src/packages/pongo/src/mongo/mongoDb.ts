import type { Collection as MongoCollection, ObjectId } from 'mongodb';
import type { Document } from 'mongodb';
import type {
  DocumentHandler,
  HandleOptions,
  PongoDb,
  PongoDBCollectionOptions,
  PongoHandleResult,
} from '../core';
import { Collection } from './mongoCollection';

export class Db {
  private pongoDb: PongoDb;
  constructor(pongoDb: PongoDb) {
    this.pongoDb = pongoDb;
  }

  get databaseName(): string {
    return this.pongoDb.databaseName;
  }

  collection<T extends Document>(
    collectionName: string,
    options?: PongoDBCollectionOptions<T>,
  ): MongoCollection<T> & {
    handle(
      id: ObjectId,
      handle: DocumentHandler<T>,
      options?: HandleOptions,
    ): Promise<PongoHandleResult<T>>;
  } {
    return new Collection<T>(
      this,
      this.pongoDb.collection<T>(collectionName, options),
    );
  }
}
