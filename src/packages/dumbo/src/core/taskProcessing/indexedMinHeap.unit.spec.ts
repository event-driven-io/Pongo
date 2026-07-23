import assert from 'assert';
import { describe, it } from 'vitest';
import { indexedMinHeap } from './indexedMinHeap';

describe('indexedMinHeap', () => {
  it('gives callers the lowest-priority item first', () => {
    const heap = testHeap();
    const slow = heapItem('slow', 30);
    const fast = heapItem('fast', 10);
    const normal = heapItem('normal', 20);

    heap.push(slow);
    heap.push(fast);
    heap.push(normal);

    assert.strictEqual(heap.pop(), fast);
    assert.strictEqual(heap.pop(), normal);
    assert.strictEqual(heap.pop(), slow);
    assert.strictEqual(heap.pop(), null);
  });

  it('lets callers inspect the next item without removing it', () => {
    const heap = testHeap();
    const first = heapItem('first', 1);

    heap.push(first);

    assert.strictEqual(heap.peek(), first);
    assert.strictEqual(heap.peek(), first);
    assert.strictEqual(heap.pop(), first);
  });

  it('keeps the remaining items available after one item leaves early', () => {
    const heap = testHeap();
    const first = heapItem('first', 1);
    const leaving = heapItem('leaving', 2);
    const next = heapItem('next', 3);

    heap.push(first);
    heap.push(leaving);
    heap.push(next);

    assert.strictEqual(heap.remove(leaving), true);
    assert.strictEqual(leaving.heapIndex, null);
    assert.strictEqual(heap.pop(), first);
    assert.strictEqual(heap.pop(), next);
  });

  it('ignores a caller that already left the heap', () => {
    const heap = testHeap();
    const item = heapItem('item', 1);

    heap.push(item);
    assert.strictEqual(heap.remove(item), true);
    assert.strictEqual(heap.remove(item), false);
  });

  it('clears every waiting item', () => {
    const heap = testHeap();
    const first = heapItem('first', 1);
    const second = heapItem('second', 2);

    heap.push(first);
    heap.push(second);
    heap.clear();

    assert.strictEqual(first.heapIndex, null);
    assert.strictEqual(second.heapIndex, null);
    assert.strictEqual(heap.peek(), null);
  });

  it('does not add the same caller twice', () => {
    const heap = testHeap();
    const item = heapItem('item', 1);

    heap.push(item);
    heap.push(item);

    assert.strictEqual(heap.pop(), item);
    assert.strictEqual(heap.pop(), null);
  });
});

type HeapItem = {
  heapIndex: number | null;
  name: string;
  priority: number;
};

const testHeap = () =>
  indexedMinHeap<HeapItem>({
    compare: (left, right) => left.priority - right.priority,
    getIndex: (item) => item.heapIndex,
    setIndex: (item, index) => {
      item.heapIndex = index;
    },
  });

const heapItem = (name: string, priority: number): HeapItem => ({
  heapIndex: null,
  name,
  priority,
});
