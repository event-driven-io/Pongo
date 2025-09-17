import { SQL } from '@event-driven-io/dumbo';
import type {
  DeleteOneOptions,
  FindOptions,
  OptionalUnlessRequiredIdAndVersion,
  PongoFilter,
  PongoUpdate,
  ReplaceOneOptions,
  UpdateOneOptions,
  WithoutId,
} from '../typing';

export type PongoCollectionSQLBuilder = {
  createCollection: () => SQL;
  insertOne: <T>(document: OptionalUnlessRequiredIdAndVersion<T>) => SQL;
  insertMany: <T>(documents: OptionalUnlessRequiredIdAndVersion<T>[]) => SQL;
  updateOne: <T>(
    filter: PongoFilter<T> | SQL,
    update: PongoUpdate<T> | SQL,
    options?: UpdateOneOptions,
  ) => SQL;
  replaceOne: <T>(
    filter: PongoFilter<T> | SQL,
    document: WithoutId<T>,
    options?: ReplaceOneOptions,
  ) => SQL;
  updateMany: <T>(
    filter: PongoFilter<T> | SQL,
    update: PongoUpdate<T> | SQL,
  ) => SQL;
  deleteOne: <T>(
    filter: PongoFilter<T> | SQL,
    options?: DeleteOneOptions,
  ) => SQL;
  deleteMany: <T>(filter: PongoFilter<T> | SQL) => SQL;
  findOne: <T>(filter: PongoFilter<T> | SQL) => SQL;
  find: <T>(filter: PongoFilter<T> | SQL, options?: FindOptions) => SQL;
  countDocuments: <T>(filter: PongoFilter<T> | SQL) => SQL;
  rename: (newName: string) => SQL;
  drop: () => SQL;
};
