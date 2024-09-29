import {
  type DatabaseTransaction,
  type DatabaseTransactionFactory,
  JSONSerializer,
  type SchemaComponent,
  type SQLExecutor,
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
  readonly schema: Readonly<{
    component: SchemaComponent;
    migrate(): Promise<void>;
  }>;
}

export type CollectionOperationOptions = {
  session?: PongoSession;
};

export type InsertOneOptions = {
  expectedVersion?: Extract<
    ExpectedDocumentVersion,
    'DOCUMENT_DOES_NOT_EXIST' | 'NO_CONCURRENCY_CHECK'
  >;
} & CollectionOperationOptions;

export type InsertManyOptions = {
  expectedVersion?: Extract<
    ExpectedDocumentVersion,
    'DOCUMENT_DOES_NOT_EXIST' | 'NO_CONCURRENCY_CHECK'
  >;
} & CollectionOperationOptions;

export type UpdateOneOptions = {
  expectedVersion?: Exclude<ExpectedDocumentVersion, 'DOCUMENT_DOES_NOT_EXIST'>;
} & CollectionOperationOptions;

export type UpsertOneOptions = {
  expectedVersion?: ExpectedDocumentVersion;
} & CollectionOperationOptions;

export type UpdateManyOptions = {
  expectedVersion?: Extract<
    ExpectedDocumentVersion,
    'DOCUMENT_EXISTS' | 'NO_CONCURRENCY_CHECK'
  >;
} & CollectionOperationOptions;

export type HandleOptions = {
  expectedVersion?: ExpectedDocumentVersion;
} & CollectionOperationOptions;

export type ReplaceOneOptions = {
  expectedVersion?: Exclude<ExpectedDocumentVersion, 'DOCUMENT_DOES_NOT_EXIST'>;
} & CollectionOperationOptions;

export type DeleteOneOptions = {
  expectedVersion?: Exclude<ExpectedDocumentVersion, 'DOCUMENT_DOES_NOT_EXIST'>;
} & CollectionOperationOptions;

export type DeleteManyOptions = {
  expectedVersion?: Extract<
    ExpectedDocumentVersion,
    'DOCUMENT_EXISTS' | 'NO_CONCURRENCY_CHECK'
  >;
} & CollectionOperationOptions;

export interface PongoCollection<T extends PongoDocument> {
  readonly dbName: string;
  readonly collectionName: string;
  createCollection(options?: CollectionOperationOptions): Promise<void>;
  insertOne(
    document: OptionalUnlessRequiredId<T>,
    options?: InsertOneOptions,
  ): Promise<PongoInsertOneResult>;
  insertMany(
    documents: OptionalUnlessRequiredId<T>[],
    options?: CollectionOperationOptions,
  ): Promise<PongoInsertManyResult>;
  updateOne(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: UpdateOneOptions,
  ): Promise<PongoUpdateResult>;
  upsertOne(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: UpsertOneOptions,
  ): Promise<PongoUpdateResult>;
  replaceOne(
    filter: PongoFilter<T>,
    document: WithoutId<T>,
    options?: ReplaceOneOptions,
  ): Promise<PongoUpdateResult>;
  updateMany(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: UpdateManyOptions,
  ): Promise<PongoUpdateResult>;
  deleteOne(
    filter?: PongoFilter<T>,
    options?: DeleteOneOptions,
  ): Promise<PongoDeleteResult>;
  deleteMany(
    filter?: PongoFilter<T>,
    options?: DeleteManyOptions,
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
    options?: DeleteOneOptions,
  ): Promise<T | null>;
  findOneAndReplace(
    filter: PongoFilter<T>,
    replacement: WithoutId<T>,
    options?: ReplaceOneOptions,
  ): Promise<T | null>;
  findOneAndUpdate(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
    options?: UpdateOneOptions,
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
    options?: HandleOptions,
  ): Promise<PongoHandleResult<T>>;
  readonly schema: Readonly<{
    component: SchemaComponent;
    migrate(): Promise<void>;
  }>;
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

export declare type OptionalUnlessRequiredVersion<TSchema> = TSchema extends {
  _version: bigint;
}
  ? TSchema
  : OptionalVersion<TSchema>;

export declare type OptionalUnlessRequiredIdAndVersion<TSchema> =
  OptionalUnlessRequiredId<TSchema> & OptionalUnlessRequiredVersion<TSchema>;

export declare type WithId<TSchema> = EnhancedOmit<TSchema, '_id'> & {
  _id: string | ObjectId;
};
export type WithoutId<T> = Omit<T, '_id'>;

export declare type WithVersion<TSchema> = EnhancedOmit<TSchema, '_version'> & {
  _version: bigint;
};
export type WithoutVersion<T> = Omit<T, '_version'>;

/** @public */
export declare type RegExpOrString<T> = T extends string ? RegExp | T : T;

export declare interface Document {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export declare type OptionalId<TSchema> = EnhancedOmit<TSchema, '_id'> & {
  _id?: string | ObjectId;
};
export declare type OptionalVersion<TSchema> = EnhancedOmit<
  TSchema,
  '_version'
> & {
  _version?: bigint;
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
export type $inc<T> = { [P in keyof T]?: number | bigint };
export type $push<T> = { [P in keyof T]?: T[P] };

export type ExpectedDocumentVersionGeneral =
  | 'DOCUMENT_EXISTS'
  | 'DOCUMENT_DOES_NOT_EXIST'
  | 'NO_CONCURRENCY_CHECK';

export type ExpectedDocumentVersionValue = bigint & { __brand: 'sql' };

export type ExpectedDocumentVersion =
  | (bigint & { __brand: 'sql' })
  | bigint
  | ExpectedDocumentVersionGeneral;

export const DOCUMENT_EXISTS =
  'DOCUMENT_EXISTS' as ExpectedDocumentVersionGeneral;
export const DOCUMENT_DOES_NOT_EXIST =
  'DOCUMENT_DOES_NOT_EXIST' as ExpectedDocumentVersionGeneral;
export const NO_CONCURRENCY_CHECK =
  'NO_CONCURRENCY_CHECK' as ExpectedDocumentVersionGeneral;

export const isGeneralExpectedDocumentVersion = (
  version: ExpectedDocumentVersion,
): version is ExpectedDocumentVersionGeneral =>
  version === 'DOCUMENT_DOES_NOT_EXIST' ||
  version === 'DOCUMENT_EXISTS' ||
  version === 'NO_CONCURRENCY_CHECK';

export const expectedVersionValue = (
  version: ExpectedDocumentVersion | undefined,
): ExpectedDocumentVersionValue | null =>
  version === undefined || isGeneralExpectedDocumentVersion(version)
    ? null
    : (version as ExpectedDocumentVersionValue);

export const expectedVersion = (
  version: number | bigint | string | undefined | null,
): ExpectedDocumentVersion => {
  return version
    ? (BigInt(version) as ExpectedDocumentVersion)
    : NO_CONCURRENCY_CHECK;
};

export type PongoUpdate<T> = {
  $set?: Partial<T>;
  $unset?: $unset<T>;
  $inc?: $inc<T>;
  $push?: $push<T>;
};

export type OperationResult = {
  acknowledged: boolean;
  successful: boolean;

  assertSuccessful: (errorMessage?: string) => void;
};

export const operationResult = <T extends OperationResult>(
  result: Omit<T, 'assertSuccess' | 'acknowledged' | 'assertSuccessful'>,
  options: {
    operationName: string;
    collectionName: string;
    errors?: { throwOnOperationFailures?: boolean } | undefined;
  },
): T => {
  const operationResult: T = {
    ...result,
    acknowledged: true,
    successful: result.successful,
    assertSuccessful: (errorMessage?: string) => {
      const { successful } = result;
      const { operationName, collectionName } = options;

      if (!successful)
        throw new Error(
          errorMessage ??
            `${operationName} on ${collectionName} failed with ${JSONSerializer.serialize(result)}!`,
        );
    },
  } as T;

  if (options.errors?.throwOnOperationFailures)
    operationResult.assertSuccessful();

  return operationResult;
};

export interface PongoInsertOneResult extends OperationResult {
  insertedId: string | null;
}

export interface PongoInsertManyResult extends OperationResult {
  insertedIds: string[];
  insertedCount: number;
}

export interface PongoUpdateResult extends OperationResult {
  matchedCount: number;
  modifiedCount: number;
}

export interface PongoUpdateManyResult extends OperationResult {
  modifiedCount: number;
}

export interface PongoDeleteResult extends OperationResult {
  matchedCount: number;
  deletedCount: number;
}

export interface PongoDeleteManyResult extends OperationResult {
  deletedCount: number;
}

export type PongoHandleResult<T> =
  | (PongoInsertOneResult & { document: T })
  | (PongoUpdateResult & { document: T })
  | (PongoDeleteResult & { document: null })
  | (OperationResult & { document: null });

export type PongoDocument = Record<string, unknown>;

export type DocumentHandler<T extends PongoDocument> =
  | ((document: T | null) => T | null)
  | ((document: T | null) => Promise<T | null>);
