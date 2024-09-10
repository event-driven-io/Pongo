import type {
  DatabaseTransaction,
  DatabaseTransactionFactory,
  SchemaComponent,
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
  enlistDatabase: (database: PongoDb) => Promise<DatabaseTransaction>;
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

export interface PongoDb<ConnectorType extends string = string>
  extends DatabaseTransactionFactory<ConnectorType> {
  get connectorType(): ConnectorType;
  get databaseName(): string;
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
    document: OptionalUnlessRequiredId<T>,
    options?: CollectionOperationOptions,
  ): Promise<PongoInsertOneResult>;
  insertMany(
    documents: OptionalUnlessRequiredId<T>[],
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
  schema: {
    component: SchemaComponent;
  };
}

export type ObjectId = string & { __brandId: 'ObjectId' };

export type HasId = { _id: string };

export declare type InferIdType<TSchema> = TSchema extends {
  _id: infer IdType;
}
  ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Record<any, never> extends IdType
    ? never
    : IdType
  : TSchema extends {
        _id?: infer IdType;
      }
    ? unknown extends IdType
      ? ObjectId
      : IdType
    : ObjectId;

/** TypeScript Omit (Exclude to be specific) does not work for objects with an "any" indexed type, and breaks discriminated unions @public */
export declare type EnhancedOmit<TRecordOrUnion, KeyUnion> =
  string extends keyof TRecordOrUnion
    ? TRecordOrUnion
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      TRecordOrUnion extends any
      ? Pick<TRecordOrUnion, Exclude<keyof TRecordOrUnion, KeyUnion>>
      : never;
export declare type OptionalUnlessRequiredId<TSchema> = TSchema extends {
  _id: string | ObjectId;
}
  ? TSchema
  : OptionalId<TSchema>;

export declare type WithId<TSchema> = EnhancedOmit<TSchema, '_id'> & {
  _id: string | ObjectId;
};

export type WithoutId<T> = Omit<T, '_id'>;

/** @public */
export declare type RegExpOrString<T> = T extends string ? RegExp | T : T;

export declare interface Document {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export declare type OptionalId<TSchema> = EnhancedOmit<TSchema, '_id'> & {
  _id?: string | ObjectId;
};

export declare interface ObjectIdLike {
  __id?: string | ObjectId;
}

export declare type NonObjectIdLikeDocument = {
  [key in keyof ObjectIdLike]?: never;
} & Document;

export declare type AlternativeType<T> =
  T extends ReadonlyArray<infer U> ? T | RegExpOrString<U> : RegExpOrString<T>;

export declare type Condition<T> =
  | AlternativeType<T>
  | PongoFilterOperator<AlternativeType<T>>;

export declare type PongoFilter<TSchema> =
  | {
      [P in keyof WithId<TSchema>]?: Condition<WithId<TSchema>[P]>;
    }
  | HasId; // TODO: & RootFilterOperators<WithId<TSchema>>;

export declare interface RootFilterOperators<TSchema> extends Document {
  $and?: PongoFilter<TSchema>[];
  $nor?: PongoFilter<TSchema>[];
  $or?: PongoFilter<TSchema>[];
  $text?: {
    $search: string;
    $language?: string;
    $caseSensitive?: boolean;
    $diacriticSensitive?: boolean;
  };
  $where?: string | ((this: TSchema) => boolean);
  $comment?: string | Document;
}

export declare interface PongoFilterOperator<TValue>
  extends NonObjectIdLikeDocument {
  $eq?: TValue;
  $gt?: TValue;
  $gte?: TValue;
  $lt?: TValue;
  $lte?: TValue;
  $ne?: TValue;
  $in?: TValue[];
  $nin?: TValue[];
  // $eq?: TValue;
  // $gt?: TValue;
  // $gte?: TValue;
  // $in?: ReadonlyArray<TValue>;
  // $lt?: TValue;
  // $lte?: TValue;
  // $ne?: TValue;
  // $nin?: ReadonlyArray<TValue>;
  // $not?: TValue extends string ? FilterOperators<TValue> | RegExp : FilterOperators<TValue>;
  // /**
  //  * When `true`, `$exists` matches the documents that contain the field,
  //  * including documents where the field value is null.
  //  */
  // $exists?: boolean;
  // $type?: BSONType | BSONTypeAlias;
  // $expr?: Record<string, any>;
  // $jsonSchema?: Record<string, any>;
  // $mod?: TValue extends number ? [number, number] : never;
  // $regex?: TValue extends string ? RegExp | BSONRegExp | string : never;
  // $options?: TValue extends string ? string : never;
  // $geoIntersects?: {
  //     $geometry: Document;
  // };
  // $geoWithin?: Document;
  // $near?: Document;
  // $nearSphere?: Document;
  // $maxDistance?: number;
  // $all?: ReadonlyArray<any>;
  // $elemMatch?: Document;
  // $size?: TValue extends ReadonlyArray<any> ? number : never;
  // $bitsAllClear?: BitwiseFilter;
  // $bitsAllSet?: BitwiseFilter;
  // $bitsAnyClear?: BitwiseFilter;
  // $bitsAnySet?: BitwiseFilter;
  // $rand?: Record<string, never>;
}

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
