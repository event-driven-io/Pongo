export async function mapSequential<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i++) {
    results.push(await fn(items[i]!, i));
  }
  return results;
}

export const mapParallel = <T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> => Promise.all(items.map(fn));

export const mapAsync = <T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: { parallel: boolean | undefined } = { parallel: false },
): Promise<R[]> =>
  options?.parallel ? mapParallel(items, fn) : mapSequential(items, fn);
