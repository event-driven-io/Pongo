import type {
  AbstractCursorOptions,
  AggregateOptions,
  AggregationCursor,
  AnyBulkWriteOperation,
  BSONSerializeOptions,
  BulkWriteOptions,
  BulkWriteResult,
  ChangeStream,
  ChangeStreamDocument,
  ChangeStreamOptions,
  CommandOperationOptions,
  CountDocumentsOptions,
  CountOptions,
  CreateIndexesOptions,
  DeleteOptions,
  DeleteResult,
  Document,
  DropCollectionOptions,
  EnhancedOmit,
  EstimatedDocumentCountOptions,
  Filter,
  FindOneAndDeleteOptions,
  FindOneAndReplaceOptions,
  FindOneAndUpdateOptions,
  FindOptions,
  Flatten,
  Hint,
  IndexDescription,
  IndexDescriptionCompact,
  IndexDescriptionInfo,
  IndexInformationOptions,
  IndexSpecification,
  InferIdType,
  InsertManyResult,
  InsertOneOptions,
  InsertOneResult,
  ListIndexesCursor,
  ListSearchIndexesCursor,
  ListSearchIndexesOptions,
  ModifyResult,
  Collection as MongoCollection,
  FindCursor as MongoFindCursor,
  ObjectId,
  OperationOptions,
  OptionalUnlessRequiredId,
  OrderedBulkOperation,
  ReadConcern,
  ReadPreference,
  RenameOptions,
  ReplaceOptions,
  SearchIndexDescription,
  UnorderedBulkOperation,
  UpdateFilter,
  UpdateOptions,
  UpdateResult,
  WithId,
  WithoutId,
  WriteConcern,
} from 'mongodb';
import type { Key } from 'readline';
import type {
  DocumentHandler,
  PongoCollection,
  PongoFilter,
  PongoUpdate,
} from '../main';
import { FindCursor } from './findCursor';

export class Collection<T extends Document> implements MongoCollection<T> {
  private collection: PongoCollection<T>;

  constructor(collection: PongoCollection<T>) {
    this.collection = collection;
  }
  get dbName(): string {
    return this.collection.dbName;
  }
  get collectionName(): string {
    return this.collection.collectionName;
  }
  get namespace(): string {
    return `${this.dbName}.${this.collectionName}`;
  }
  get readConcern(): ReadConcern | undefined {
    return undefined;
  }
  get readPreference(): ReadPreference | undefined {
    return undefined;
  }
  get bsonOptions(): BSONSerializeOptions {
    return {};
  }
  get writeConcern(): WriteConcern | undefined {
    return undefined;
  }
  get hint(): Hint | undefined {
    return undefined;
  }
  set hint(v: Hint | undefined) {
    throw new Error('Method not implemented.');
  }
  async insertOne(
    doc: OptionalUnlessRequiredId<T>,
    _options?: InsertOneOptions | undefined,
  ): Promise<InsertOneResult<T>> {
    const result = await this.collection.insertOne(doc as T);
    return {
      acknowledged: result.acknowledged,
      insertedId: result.insertedId as unknown as InferIdType<T>,
    };
  }
  async insertMany(
    docs: OptionalUnlessRequiredId<T>[],
    _options?: BulkWriteOptions | undefined,
  ): Promise<InsertManyResult<T>> {
    const result = await this.collection.insertMany(docs as T[]);
    return {
      acknowledged: result.acknowledged,
      insertedIds: result.insertedIds as unknown as InferIdType<T>[],
      insertedCount: result.insertedCount,
    };
  }
  bulkWrite(
    _operations: AnyBulkWriteOperation<T>[],
    _options?: BulkWriteOptions | undefined,
  ): Promise<BulkWriteResult> {
    throw new Error('Method not implemented.');
  }
  async updateOne(
    filter: Filter<T>,
    update: Document[] | UpdateFilter<T>,
    _options?: UpdateOptions | undefined,
  ): Promise<UpdateResult<T>> {
    const result = await this.collection.updateOne(
      filter as unknown as PongoFilter<T>,
      update as unknown as PongoUpdate<T>,
    );

    return {
      acknowledged: result.acknowledged,
      matchedCount: result.modifiedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.modifiedCount,
      upsertedId: null,
    };
  }
  replaceOne(
    filter: Filter<T>,
    document: WithoutId<T>,
    _options?: ReplaceOptions | undefined,
  ): Promise<Document | UpdateResult<T>> {
    return this.collection.replaceOne(
      filter as unknown as PongoFilter<T>,
      document,
    );
  }
  async updateMany(
    filter: Filter<T>,
    update: Document[] | UpdateFilter<T>,
    _options?: UpdateOptions | undefined,
  ): Promise<UpdateResult<T>> {
    const result = await this.collection.updateMany(
      filter as unknown as PongoFilter<T>,
      update as unknown as PongoUpdate<T>,
    );

    return {
      acknowledged: result.acknowledged,
      matchedCount: result.modifiedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.modifiedCount,
      upsertedId: null,
    };
  }
  async deleteOne(
    filter?: Filter<T> | undefined,
    _options?: DeleteOptions | undefined,
  ): Promise<DeleteResult> {
    const result = await this.collection.deleteOne(
      filter as unknown as PongoFilter<T>,
    );

    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount,
    };
  }
  async deleteMany(
    filter?: Filter<T> | undefined,
    _options?: DeleteOptions | undefined,
  ): Promise<DeleteResult> {
    const result = await this.collection.deleteMany(
      filter as unknown as PongoFilter<T>,
    );

    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount,
    };
  }
  async rename(
    newName: string,
    _options?: RenameOptions | undefined,
  ): Promise<Collection<Document>> {
    await this.collection.rename(newName);

    return this as unknown as Collection<Document>;
  }
  drop(_options?: DropCollectionOptions | undefined): Promise<boolean> {
    return this.collection.drop();
  }
  findOne(): Promise<WithId<T> | null>;
  findOne(filter: Filter<T>): Promise<WithId<T> | null>;
  findOne(
    filter: Filter<T>,
    options: FindOptions<Document>,
  ): Promise<WithId<T> | null>;
  findOne<TS = T>(): Promise<TS | null>;
  findOne<TS = T>(filter: Filter<TS>): Promise<TS | null>;
  findOne<TS = T>(
    filter: Filter<TS>,
    options?: FindOptions<Document> | undefined,
  ): Promise<TS | null>;
  async findOne(
    filter?: unknown,
    _options?: unknown,
  ): Promise<import('mongodb').WithId<T> | T | null> {
    return this.collection.findOne(filter as PongoFilter<T>);
  }
  find(): MongoFindCursor<WithId<T>>;
  find(
    filter: Filter<T>,
    options?: FindOptions<Document> | undefined,
  ): MongoFindCursor<WithId<T>>;
  find<T extends Document>(
    filter: Filter<T>,
    options?: FindOptions<Document> | undefined,
  ): MongoFindCursor<T>;
  find(
    filter?: unknown,
    _options?: unknown,
  ): MongoFindCursor<WithId<T>> | MongoFindCursor<T> {
    return new FindCursor(
      this.collection.find(filter as PongoFilter<T>),
    ) as unknown as MongoFindCursor<T>;
  }
  options(_options?: OperationOptions | undefined): Promise<Document> {
    throw new Error('Method not implemented.');
  }
  isCapped(_options?: OperationOptions | undefined): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  createIndex(
    _indexSpec: IndexSpecification,
    _options?: CreateIndexesOptions | undefined,
  ): Promise<string> {
    throw new Error('Method not implemented.');
  }
  createIndexes(
    _indexSpecs: IndexDescription[],
    _options?: CreateIndexesOptions | undefined,
  ): Promise<string[]> {
    throw new Error('Method not implemented.');
  }
  dropIndex(
    _indexName: string,
    _options?: CommandOperationOptions | undefined,
  ): Promise<Document> {
    throw new Error('Method not implemented.');
  }
  dropIndexes(
    _options?: CommandOperationOptions | undefined,
  ): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  listIndexes(_options?: AbstractCursorOptions | undefined): ListIndexesCursor {
    throw new Error('Method not implemented.');
  }
  indexExists(
    _indexes: string | string[],
    _options?: AbstractCursorOptions | undefined,
  ): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  indexInformation(
    options: IndexInformationOptions & { full: true },
  ): Promise<IndexDescriptionInfo[]>;
  indexInformation(
    options: IndexInformationOptions & { full?: false | undefined },
  ): Promise<IndexDescriptionCompact>;
  indexInformation(
    options: IndexInformationOptions,
  ): Promise<IndexDescriptionCompact | IndexDescriptionInfo[]>;
  indexInformation(): Promise<IndexDescriptionCompact>;
  indexInformation(
    _options?: unknown,
  ):
    | Promise<import('mongodb').IndexDescriptionInfo[]>
    | Promise<import('mongodb').IndexDescriptionCompact>
    | Promise<
        | import('mongodb').IndexDescriptionCompact
        | import('mongodb').IndexDescriptionInfo[]
      > {
    throw new Error('Method not implemented.');
  }
  estimatedDocumentCount(
    _options?: EstimatedDocumentCountOptions | undefined,
  ): Promise<number> {
    throw new Error('Method not implemented.');
  }
  countDocuments(
    filter?: Filter<T> | undefined,
    _options?: CountDocumentsOptions | undefined,
  ): Promise<number> {
    return this.collection.countDocuments(filter as PongoFilter<T>);
  }
  distinct<Key extends '_id' | keyof EnhancedOmit<T, '_id'>>(
    key: Key,
  ): Promise<Flatten<WithId<T>[Key]>[]>;
  distinct<Key extends '_id' | keyof EnhancedOmit<T, '_id'>>(
    key: Key,
    filter: Filter<T>,
  ): Promise<Flatten<WithId<T>[Key]>[]>;
  distinct<Key extends '_id' | keyof EnhancedOmit<T, '_id'>>(
    key: Key,
    filter: Filter<T>,
    options: CommandOperationOptions,
  ): Promise<Flatten<WithId<T>[Key]>[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  distinct(key: string): Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  distinct(key: string, filter: Filter<T>): Promise<any[]>;
  distinct(
    key: string,
    filter: Filter<T>,
    options: CommandOperationOptions, // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]>;
  distinct(
    _key: unknown,
    _filter?: unknown,
    _options?: unknown,
  ): // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | Promise<any[]>
    | Promise<import('mongodb').Flatten<import('mongodb').WithId<T>[Key]>[]> {
    throw new Error('Method not implemented.');
  }
  indexes(
    options: IndexInformationOptions & { full?: true | undefined },
  ): Promise<IndexDescriptionInfo[]>;
  indexes(
    options: IndexInformationOptions & { full: false },
  ): Promise<IndexDescriptionCompact>;
  indexes(
    options: IndexInformationOptions,
  ): Promise<IndexDescriptionCompact | IndexDescriptionInfo[]>;
  indexes(
    options?: AbstractCursorOptions | undefined,
  ): Promise<IndexDescriptionInfo[]>;
  indexes(
    _options?: unknown,
  ):
    | Promise<import('mongodb').IndexDescriptionInfo[]>
    | Promise<import('mongodb').IndexDescriptionCompact>
    | Promise<
        | import('mongodb').IndexDescriptionCompact
        | import('mongodb').IndexDescriptionInfo[]
      > {
    throw new Error('Method not implemented.');
  }
  findOneAndDelete(
    filter: Filter<T>,
    options: FindOneAndDeleteOptions & { includeResultMetadata: true },
  ): Promise<ModifyResult<T>>;
  findOneAndDelete(
    filter: Filter<T>,
    options: FindOneAndDeleteOptions & { includeResultMetadata: false },
  ): Promise<WithId<T> | null>;
  findOneAndDelete(
    filter: Filter<T>,
    options: FindOneAndDeleteOptions,
  ): Promise<WithId<T> | null>;
  findOneAndDelete(filter: Filter<T>): Promise<WithId<T> | null>;
  findOneAndDelete(
    _filter: unknown,
    _options?: unknown,
  ):
    | Promise<import('mongodb').WithId<T> | null>
    | Promise<import('mongodb').ModifyResult<T>> {
    throw new Error('Method not implemented.');
  }
  findOneAndReplace(
    filter: Filter<T>,
    replacement: WithoutId<T>,
    options: FindOneAndReplaceOptions & { includeResultMetadata: true },
  ): Promise<ModifyResult<T>>;
  findOneAndReplace(
    filter: Filter<T>,
    replacement: WithoutId<T>,
    options: FindOneAndReplaceOptions & { includeResultMetadata: false },
  ): Promise<WithId<T> | null>;
  findOneAndReplace(
    filter: Filter<T>,
    replacement: WithoutId<T>,
    options: FindOneAndReplaceOptions,
  ): Promise<WithId<T> | null>;
  findOneAndReplace(
    filter: Filter<T>,
    replacement: WithoutId<T>,
  ): Promise<WithId<T> | null>;
  findOneAndReplace(
    _filter: unknown,
    _replacement: unknown,
    _options?: unknown,
  ):
    | Promise<import('mongodb').WithId<T> | null>
    | Promise<import('mongodb').ModifyResult<T>> {
    throw new Error('Method not implemented.');
  }
  findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options: FindOneAndUpdateOptions & { includeResultMetadata: true },
  ): Promise<ModifyResult<T>>;
  findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options: FindOneAndUpdateOptions & { includeResultMetadata: false },
  ): Promise<WithId<T> | null>;
  findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
    options: FindOneAndUpdateOptions,
  ): Promise<WithId<T> | null>;
  findOneAndUpdate(
    filter: Filter<T>,
    update: UpdateFilter<T>,
  ): Promise<WithId<T> | null>;
  findOneAndUpdate(
    _filter: unknown,
    _update: unknown,
    _options?: unknown,
  ):
    | Promise<import('mongodb').WithId<T> | null>
    | Promise<import('mongodb').ModifyResult<T>> {
    throw new Error('Method not implemented.');
  }
  aggregate<T extends Document = Document>(
    _pipeline?: Document[] | undefined,
    _options?: AggregateOptions | undefined,
  ): AggregationCursor<T> {
    throw new Error('Method not implemented.');
  }
  watch<
    TLocal extends Document = T,
    TChange extends Document = ChangeStreamDocument<TLocal>,
  >(
    _pipeline?: Document[] | undefined,
    _options?: ChangeStreamOptions | undefined,
  ): ChangeStream<TLocal, TChange> {
    throw new Error('Method not implemented.');
  }
  initializeUnorderedBulkOp(
    _options?: BulkWriteOptions | undefined,
  ): UnorderedBulkOperation {
    throw new Error('Method not implemented.');
  }
  initializeOrderedBulkOp(
    _options?: BulkWriteOptions | undefined,
  ): OrderedBulkOperation {
    throw new Error('Method not implemented.');
  }
  count(
    _filter?: Filter<T> | undefined,
    _options?: CountOptions | undefined,
  ): Promise<number> {
    throw new Error('Method not implemented.');
  }
  listSearchIndexes(
    options?: ListSearchIndexesOptions | undefined,
  ): ListSearchIndexesCursor;
  listSearchIndexes(
    name: string,
    options?: ListSearchIndexesOptions | undefined,
  ): ListSearchIndexesCursor;
  listSearchIndexes(
    _name?: unknown,
    _options?: unknown,
  ): import('mongodb').ListSearchIndexesCursor {
    throw new Error('Method not implemented.');
  }
  createSearchIndex(_description: SearchIndexDescription): Promise<string> {
    throw new Error('Method not implemented.');
  }
  createSearchIndexes(
    _descriptions: SearchIndexDescription[],
  ): Promise<string[]> {
    throw new Error('Method not implemented.');
  }
  dropSearchIndex(_name: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  updateSearchIndex(_name: string, _definition: Document): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async createCollection(): Promise<void> {
    await this.collection.createCollection();
  }
  async handle(id: ObjectId, handle: DocumentHandler<T>): Promise<T | null> {
    return this.collection.handle(id.toString(), handle);
  }
}
