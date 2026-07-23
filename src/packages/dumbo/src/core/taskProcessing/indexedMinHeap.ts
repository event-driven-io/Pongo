export type IndexedMinHeap<T> = ReturnType<typeof indexedMinHeap<T>>;

/**
 * Keeps the next lowest-priority item cheap to read while still letting callers
 * remove a waiting item directly when it aborts, expires, or leaves early.
 */
export const indexedMinHeap = <T>({
  compare,
  getIndex,
  setIndex,
}: {
  compare: (left: T, right: T) => number;
  getIndex: (item: T) => number | null;
  setIndex: (item: T, index: number | null) => void;
}) => {
  const items: T[] = [];

  const push = (item: T): void => {
    if (getIndex(item) !== null) return;

    items.push(item);
    setIndex(item, items.length - 1);
    bubbleUp(items.length - 1);
  };

  const pop = (): T | null => {
    if (items.length === 0) return null;

    const item = items[0]!;
    removeAt(0);
    return item;
  };

  const peek = (): T | null => items[0] ?? null;

  const remove = (item: T): boolean => {
    const index = getIndex(item);
    if (index === null) return false;

    removeAt(index);
    return true;
  };

  const clear = (): void => {
    for (const item of items) {
      setIndex(item, null);
    }
    items.length = 0;
  };

  const removeAt = (index: number): void => {
    const removed = items[index];
    if (removed === undefined) return;

    const last = items.pop();
    setIndex(removed, null);

    if (last === undefined || index === items.length) return;

    items[index] = last;
    setIndex(last, index);
    bubbleDown(index);
    bubbleUp(index);
  };

  const bubbleUp = (startIndex: number): void => {
    let index = startIndex;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (compare(items[index]!, items[parentIndex]!) >= 0) return;

      swap(index, parentIndex);
      index = parentIndex;
    }
  };

  const bubbleDown = (startIndex: number): void => {
    let index = startIndex;

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallestIndex = index;

      if (
        leftIndex < items.length &&
        compare(items[leftIndex]!, items[smallestIndex]!) < 0
      ) {
        smallestIndex = leftIndex;
      }

      if (
        rightIndex < items.length &&
        compare(items[rightIndex]!, items[smallestIndex]!) < 0
      ) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === index) return;

      swap(index, smallestIndex);
      index = smallestIndex;
    }
  };

  const swap = (leftIndex: number, rightIndex: number): void => {
    const left = items[leftIndex]!;
    const right = items[rightIndex]!;
    items[leftIndex] = right;
    items[rightIndex] = left;
    setIndex(right, leftIndex);
    setIndex(left, rightIndex);
  };

  return {
    clear,
    peek,
    pop,
    push,
    remove,
  };
};
