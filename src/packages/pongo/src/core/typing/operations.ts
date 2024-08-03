import type {
  ConnectionPool,
  DatabaseTransaction,
  SQLExecutor,
} from '@event-driven-io/dumbo';

export interface PongoClient {
  connect(): Promise<this>;

  close(): Promise<void>;

  db(dbName?: string): PongoDb;

  startSession(): PongoSession;

  withSession<T = unknown>(
    callback: (session: PongoSession) => Promise<T>,
  ): Promise<T>;
}

export declare interface PongoTransactionOptions {
  get snapshotEnabled(): boolean;
  maxCommitTimeMS?: number;
}

export interface PongoDbTransaction {
  get databaseName(): string | null;
  options: PongoTransactionOptions;
  useDatabase: (database: PongoDb) => Promise<DatabaseTransaction>;
  commit: () => Promise<void>;
  rollback: (error?: unknown) => Promise<void>;
  get sqlExecutor(): SQLExecutor;
  get isStarting(): boolean;
  get isActive(): boolean;
  get isCommitted(): boolean;
}

export interface PongoSession {
  hasEnded: boolean;
  explicit: boolean;
  defaultTransactionOptions: PongoTransactionOptions;
  transaction: PongoDbTransaction | null;
  get snapshotEnabled(): boolean;

  endSession(): Promise<void>;
  incrementTransactionNumber(): void;
  inTransaction(): boolean;
  startTransaction(options?: PongoTransactionOptions): void;
  commitTransaction(): Promise<void>;
  abortTransaction(): Promise<void>;
  withTransaction<T = unknown>(
    fn: (session: PongoSession) => Promise<T>,
    options?: PongoTransactionOptions,
  ): Promise<T>;
}

export interface PongoDb<DbType extends string = string> {
  get databaseType(): DbType;
  get databaseName(): string;
  pool: ConnectionPool;
  connect(): Promise<void>;
  close(): Promise<void>;
  collection<T extends PongoDocument>(name: string): PongoCollection<T>;
}

export type CollectionOperationOptions = {
  session?: PongoSession;
};

export interface PongoCollection<T extends PongoDocument> {
  readonly dbName: string;
  readonly collectionName: string;
  createCollection(options?: CollectionOperationOptions): Promise<void>;
  insertOne(
    document: T,
    options?: CollectionOperationOptions,
  ): Promise<PongoInsertOneResult>;
  insertMany(
    documents: T[],
    options?: CollectionOperationOptions,
  ): Promise<PongoInsertManyResult>;
  updateOne(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: CollectionOperationOptions,
  ): Promise<PongoUpdateResult>;
  replaceOne(
    filter: PongoFilter<T>,
    document: WithoutId<T>,
    options?: CollectionOperationOptions,
  ): Promise<PongoUpdateResult>;
  updateMany(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: CollectionOperationOptions,
  ): Promise<PongoUpdateResult>;
  deleteOne(
    filter?: PongoFilter<T>,
    options?: CollectionOperationOptions,
  ): Promise<PongoDeleteResult>;
  deleteMany(
    filter?: PongoFilter<T>,
    options?: CollectionOperationOptions,
  ): Promise<PongoDeleteResult>;
  findOne(
    filter?: PongoFilter<T>,
    options?: CollectionOperationOptions,
  ): Promise<T | null>;
  find(
    filter?: PongoFilter<T>,
    options?: CollectionOperationOptions,
  ): Promise<T[]>;
  findOneAndDelete(
    filter: PongoFilter<T>,
    options?: CollectionOperationOptions,
  ): Promise<T | null>;
  findOneAndReplace(
    filter: PongoFilter<T>,
    replacement: WithoutId<T>,
    options?: CollectionOperationOptions,
  ): Promise<T | null>;
  findOneAndUpdate(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: CollectionOperationOptions,
  ): Promise<T | null>;
  countDocuments(
    filter?: PongoFilter<T>,
    options?: CollectionOperationOptions,
  ): Promise<number>;
  drop(options?: CollectionOperationOptions): Promise<boolean>;
  rename(
    newName: string,
    options?: CollectionOperationOptions,
  ): Promise<PongoCollection<T>>;
  handle(
    id: string,
    handle: DocumentHandler<T>,
    options?: CollectionOperationOptions,
  ): Promise<T | null>;
}

export type HasId = { _id: string };

export type WithId<T> = T & HasId;

export type WithoutId<T> = Omit<T, '_id'>;

export type PongoFilter<T> =
  | {
      [P in keyof T]?: T[P] | PongoFilterOperator<T[P]>;
    }
  | HasId;

export type PongoFilterOperator<T> = {
  $eq?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $ne?: T;
  $in?: T[];
  $nin?: T[];
};

export type $set<T> = Partial<T>;
export type $unset<T> = { [P in keyof T]?: '' };
export type $inc<T> = { [P in keyof T]?: number };
export type $push<T> = { [P in keyof T]?: T[P] };

export type PongoUpdate<T> = {
  $set?: Partial<T>;
  $unset?: $unset<T>;
  $inc?: $inc<T>;
  $push?: $push<T>;
};

export interface PongoInsertOneResult {
  insertedId: string | null;
  acknowledged: boolean;
}

export interface PongoInsertManyResult {
  acknowledged: boolean;
  insertedIds: string[];
  insertedCount: number;
}

export interface PongoUpdateResult {
  acknowledged: boolean;
  modifiedCount: number;
}

export interface PongoUpdateManyResult {
  acknowledged: boolean;
  modifiedCount: number;
}

export interface PongoDeleteResult {
  acknowledged: boolean;
  deletedCount: number;
}

export interface PongoDeleteManyResult {
  acknowledged: boolean;
  deletedCount: number;
}

export type PongoDocument = Record<string, unknown>;

export type DocumentHandler<T extends PongoDocument> =
  | ((document: T | null) => T | null)
  | ((document: T | null) => Promise<T | null>);