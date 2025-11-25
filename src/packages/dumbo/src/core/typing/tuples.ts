import type { AnyTypeValidationError } from './validation';

export type GetTupleLength<T extends readonly unknown[]> = T['length'];

export type NotEmptyTuple<T extends readonly unknown[]> =
  GetTupleLength<T> extends 0 ? never : T;

export type HaveTuplesTheSameLength<
  T extends readonly unknown[],
  U extends readonly unknown[],
> = GetTupleLength<T> extends GetTupleLength<U> ? true : false;

export type IsEmptyTuple<T extends readonly unknown[]> = T extends []
  ? true
  : false;

export type IsNotEmptyTuple<T extends readonly unknown[]> =
  IsEmptyTuple<T> extends true ? false : true;

export type AllInTuple<
  Tuple extends readonly string[],
  Union extends string,
> = Tuple extends readonly [infer First, ...infer Rest]
  ? First extends Union
    ? Rest extends readonly string[]
      ? AllInTuple<Rest, Union>
      : true
    : false
  : true;

export type FilterExistingInUnion<
  Tuple extends readonly string[],
  Union extends string,
> = Tuple extends readonly [infer First, ...infer Rest]
  ? First extends Union
    ? [First, ...FilterNotExistingInUnion<Rest & readonly string[], Union>]
    : [...FilterNotExistingInUnion<Rest & readonly string[], Union>]
  : [];

export type FilterNotExistingInUnion<
  Tuple extends readonly string[],
  Union extends string,
> = Tuple extends readonly [infer First, ...infer Rest]
  ? First extends Union
    ? [
        ...FilterNotExistingInUnion<
          Rest extends readonly string[] ? Rest : [],
          Union
        >,
      ]
    : [
        First,
        ...FilterNotExistingInUnion<
          Rest extends readonly string[] ? Rest : [],
          Union
        >,
      ]
  : [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EnsureTuple<T> = T extends any[] ? T : [T];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;

type LastOfUnion<T> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  UnionToIntersection<T extends any ? () => T : never> extends () => infer R
    ? R
    : never;

type UnionToTuple<T, L = LastOfUnion<T>> = [T] extends [never]
  ? []
  : [...UnionToTuple<Exclude<T, L>>, L];

type TaggedUnion<T> = { [K in keyof T]: [K, T[K]] }[keyof T];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToKeyValue<T extends [any, any][]> = {
  [I in keyof T]: { key: T[I][0]; value: T[I][1] };
};

export type EntriesToTuple<T> = ToKeyValue<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  UnionToTuple<TaggedUnion<T>> extends [any, any][]
    ? UnionToTuple<TaggedUnion<T>>
    : never
>;

export type ZipTuplesCollectErrors<
  TupleA extends readonly unknown[],
  TupleB extends readonly unknown[],
  ValidateMap,
  Accumulated extends AnyTypeValidationError[] = [],
> = [TupleA, TupleB] extends [
  readonly [infer FirstA, ...infer RestA],
  readonly [infer FirstB, ...infer RestB],
]
  ? FirstA extends keyof ValidateMap
    ? FirstB extends keyof ValidateMap[FirstA]
      ? ValidateMap[FirstA][FirstB] extends infer Result extends
          AnyTypeValidationError
        ? ZipTuplesCollectErrors<
            RestA,
            RestB,
            ValidateMap,
            [...Accumulated, Result]
          >
        : ZipTuplesCollectErrors<RestA, RestB, ValidateMap, Accumulated>
      : ZipTuplesCollectErrors<RestA, RestB, ValidateMap, Accumulated>
    : ZipTuplesCollectErrors<RestA, RestB, ValidateMap, Accumulated>
  : Accumulated;

export type MapEntriesCollectErrors<
  Entries extends readonly unknown[],
  ValidateMap,
  Accumulated extends AnyTypeValidationError[] = [],
> = Entries extends readonly [infer First, ...infer Rest]
  ? First extends { key: infer K; value: infer _V }
    ? K extends keyof ValidateMap
      ? ValidateMap[K] extends infer Result extends AnyTypeValidationError
        ? MapEntriesCollectErrors<Rest, ValidateMap, [...Accumulated, Result]>
        : MapEntriesCollectErrors<Rest, ValidateMap, Accumulated>
      : MapEntriesCollectErrors<Rest, ValidateMap, Accumulated>
    : MapEntriesCollectErrors<Rest, ValidateMap, Accumulated>
  : Accumulated;

export type MapRecordCollectErrors<
  Record extends object,
  ValidateMap,
  Accumulated extends AnyTypeValidationError[] = [],
  Keys extends readonly unknown[] = UnionToTuple<keyof Record>,
> = Keys extends readonly [infer K, ...infer Rest]
  ? K extends keyof ValidateMap
    ? ValidateMap[K] extends infer Result extends AnyTypeValidationError
      ? MapRecordCollectErrors<
          Record,
          ValidateMap,
          [...Accumulated, Result],
          Rest
        >
      : MapRecordCollectErrors<Record, ValidateMap, Accumulated, Rest>
    : MapRecordCollectErrors<Record, ValidateMap, Accumulated, Rest>
  : Accumulated;
