type Entry<T> = {
  [K in keyof Required<T>]: [K, Required<T>[K]];
}[keyof Required<T>];

type IterableEntry<T> = Entry<T> & {
  [Symbol.iterator](): Iterator<Entry<T>>;
};

export const entries = <T extends object>(obj: T): IterableEntry<T>[] =>
  Object.entries(obj).map(([key, value]) => [key as keyof T, value]);

export type NonPartial<T> = { [K in keyof Required<T>]: T[K] };
