// src/pongoTypes.ts
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
  // Add more operators as needed
};

export type PongoUpdate<T> = {
  $set?: Partial<T>;
  $unset?: { [P in keyof T]?: '' };
  $inc?: { [P in keyof T]?: number };
  $push?: { [P in keyof T]?: T[P] };
  // Add more update operators as needed
};

export interface PongoInsertResult {
  insertedId: string;
}

export interface PongoUpdateResult {
  modifiedCount: number;
}

export interface PongoDeleteResult {
  deletedCount: number;
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
}
