export interface PongoClient {
  connect(): Promise<this>;

  close(): Promise<void>;

  db(dbName?: string): PongoDb;
}

export interface PongoDb {
  collection<T>(name: string): PongoCollection<T>;
}

export interface PongoCollection<T> {
  readonly dbName: string;
  readonly collectionName: string;
  createCollection(): Promise<void>;
  insertOne(document: T): Promise<PongoInsertOneResult>;
  insertMany(documents: T[]): Promise<PongoInsertManyResult>;
  updateOne(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
  ): Promise<PongoUpdateResult>;
  replaceOne(
    filter: PongoFilter<T>,
    document: WithoutId<T>,
  ): Promise<PongoUpdateResult>;
  updateMany(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
  ): Promise<PongoUpdateResult>;
  deleteOne(filter: PongoFilter<T>): Promise<PongoDeleteResult>;
  deleteMany(filter: PongoFilter<T>): Promise<PongoDeleteResult>;
  findOne(filter: PongoFilter<T>): Promise<T | null>;
  find(filter: PongoFilter<T>): Promise<T[]>;
  drop(): Promise<boolean>;
  rename(newName: string): Promise<PongoCollection<T>>;
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
