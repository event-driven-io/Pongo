export interface PongoClient {
  connect(): Promise<void>;

  close(): Promise<void>;

  db(dbName?: string): PongoDb;
}

export interface PongoDb {
  collection<T>(name: string): PongoCollection<T>;
}

export interface PongoCollection<T> {
  createCollection(): Promise<void>;
  insertOne(document: T): Promise<PongoInsertResult>;
  updateOne(
    filter: PongoFilter<T>,
    update: PongoUpdate<T>,
  ): Promise<PongoUpdateResult>;
  deleteOne(filter: PongoFilter<T>): Promise<PongoDeleteResult>;
  findOne(filter: PongoFilter<T>): Promise<T | null>;
  find(filter: PongoFilter<T>): Promise<T[]>;
}

export type PongoFilter<T> = {
  [P in keyof T]?: T[P] | PongoFilterOperator<T[P]>;
};

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

export type PongoUpdate<T> = {
  $set?: Partial<T>;
  $unset?: { [P in keyof T]?: '' };
  $inc?: { [P in keyof T]?: number };
  $push?: { [P in keyof T]?: T[P] };
};

export interface PongoInsertResult {
  insertedId: string | null;
  insertedCount: number | null;
}

export interface PongoUpdateResult {
  modifiedCount: number | null;
}

export interface PongoDeleteResult {
  deletedCount: number | null;
}
