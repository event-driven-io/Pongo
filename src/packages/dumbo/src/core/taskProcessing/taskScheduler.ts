import { indexedMinHeap } from './indexedMinHeap';
import type { TaskQueueItem } from './taskProcessor';

export type TaskScheduler = {
  /** Removes every waiting task in arrival order, for example when processing is stopped. */
  clear: () => TaskQueueItem[];
  /** Marks a started task as finished so the next waiting task from its group may run. */
  complete: (item: TaskQueueItem) => void;
  /** Adds a caller to the waiting set while preserving its arrival position. */
  enqueue: (item: TaskQueueItem) => void;
  /** Removes callers that waited past their deadline and returns them in expiration order. */
  expire: (nowMs: number) => TaskQueueItem[];
  /** Returns when the next waiting caller should stop waiting, if any caller has a deadline. */
  nextExpirationMs: () => number | null;
  /** Removes a waiting caller that left before it started, for example after aborting. */
  remove: (item: TaskQueueItem) => boolean;
  /** Returns how many callers are still waiting to start. */
  size: () => number;
  /** Starts the earliest waiting caller that is allowed to run right now. */
  takeNext: () => TaskQueueItem | null;
};

type QueueEntry = {
  expirationHeapIndex: number | null;
  groupId: string | undefined;
  item: TaskQueueItem;
  readyHeapIndex: number | null;
  sequence: number;
  state: 'active' | 'queued' | 'removed';
};

type GroupQueue = {
  active: boolean;
  entries: QueueEntry[];
  headIndex: number;
};

/**
 * Chooses which waiting task may start next while preserving arrival order for
 * callers that are allowed to run and keeping grouped work serialized.
 */
export const taskScheduler = (): TaskScheduler => {
  let nextSequence = 0;
  let queuedSize = 0;
  const entriesByItem = new Map<TaskQueueItem, QueueEntry>();
  const activeEntriesByItem = new Map<TaskQueueItem, QueueEntry>();
  const groups = new Map<string, GroupQueue>();
  const readyHeap = indexedMinHeap<QueueEntry>({
    compare: (left, right) => left.sequence - right.sequence,
    getIndex: (entry) => entry.readyHeapIndex,
    setIndex: (entry, index) => {
      entry.readyHeapIndex = index;
    },
  });
  const expirationHeap = indexedMinHeap<QueueEntry>({
    compare: (left, right) => {
      const deadlineComparison =
        (left.item.expiresAtMs ?? Number.MAX_SAFE_INTEGER) -
        (right.item.expiresAtMs ?? Number.MAX_SAFE_INTEGER);

      return deadlineComparison === 0
        ? left.sequence - right.sequence
        : deadlineComparison;
    },
    getIndex: (entry) => entry.expirationHeapIndex,
    setIndex: (entry, index) => {
      entry.expirationHeapIndex = index;
    },
  });

  const enqueue = (item: TaskQueueItem): void => {
    if (entriesByItem.has(item) || activeEntriesByItem.has(item)) return;

    const entry: QueueEntry = {
      expirationHeapIndex: null,
      groupId: item.options?.taskGroupId,
      item,
      readyHeapIndex: null,
      sequence: nextSequence++,
      state: 'queued',
    };

    entriesByItem.set(item, entry);
    queuedSize++;

    if (item.expiresAtMs !== undefined) {
      expirationHeap.push(entry);
    }

    if (entry.groupId === undefined) {
      readyHeap.push(entry);
      return;
    }

    const group = getOrCreateGroup(entry.groupId);
    group.entries.push(entry);
    promoteGroupHead(group);
  };

  const takeNext = (): TaskQueueItem | null => {
    const entry = readyHeap.pop();
    if (entry === null) return null;

    entry.state = 'active';
    queuedSize--;
    entriesByItem.delete(entry.item);
    activeEntriesByItem.set(entry.item, entry);
    expirationHeap.remove(entry);

    if (entry.groupId !== undefined) {
      const group = groups.get(entry.groupId);
      if (group) {
        group.active = true;
        compactGroupHead(group);
      }
    }

    return entry.item;
  };

  const remove = (item: TaskQueueItem): boolean => {
    const entry = entriesByItem.get(item);
    if (!entry || entry.state !== 'queued') return false;

    removeEntry(entry);
    return true;
  };

  /**
   * Lets the next waiting task from the same group become eligible after a
   * previously started task finishes.
   */
  const complete = (item: TaskQueueItem): void => {
    const entry = activeEntriesByItem.get(item);
    if (!entry) return;

    activeEntriesByItem.delete(item);
    const groupId = entry.groupId;
    if (groupId === undefined) return;

    const group = groups.get(groupId);
    if (!group) return;

    group.active = false;
    promoteGroupHead(group);
  };

  const nextExpirationMs = (): number | null => {
    const entry = expirationHeap.peek();
    return entry?.item.expiresAtMs ?? null;
  };

  const expire = (nowMs: number): TaskQueueItem[] => {
    const expired: TaskQueueItem[] = [];

    while (true) {
      const entry = expirationHeap.peek();
      if (
        entry === null ||
        entry.item.expiresAtMs === undefined ||
        entry.item.expiresAtMs > nowMs
      ) {
        return expired;
      }

      expirationHeap.pop();
      if (entry.state !== 'queued') continue;

      removeEntry(entry);
      expired.push(entry.item);
    }
  };

  const clear = (): TaskQueueItem[] => {
    const queuedItems = [...entriesByItem.values()]
      .filter((entry) => entry.state === 'queued')
      .sort((left, right) => left.sequence - right.sequence)
      .map((entry) => entry.item);

    nextSequence = 0;
    queuedSize = 0;
    entriesByItem.clear();
    groups.clear();
    readyHeap.clear();
    expirationHeap.clear();

    return queuedItems;
  };

  const size = (): number => queuedSize;

  const getOrCreateGroup = (groupId: string): GroupQueue => {
    const existing = groups.get(groupId);
    if (existing) return existing;

    const group = {
      active: false,
      entries: [],
      headIndex: 0,
    };
    groups.set(groupId, group);
    return group;
  };

  const removeEntry = (entry: QueueEntry): void => {
    entry.state = 'removed';
    queuedSize--;
    entriesByItem.delete(entry.item);
    readyHeap.remove(entry);
    expirationHeap.remove(entry);

    if (entry.groupId === undefined) return;

    const group = groups.get(entry.groupId);
    if (!group) return;

    promoteGroupHead(group);
  };

  const promoteGroupHead = (group: GroupQueue): void => {
    if (group.active) return;

    const head = compactGroupHead(group);
    if (!head || head.readyHeapIndex !== null) return;

    readyHeap.push(head);
  };

  const compactGroupHead = (group: GroupQueue): QueueEntry | null => {
    while (
      group.headIndex < group.entries.length &&
      group.entries[group.headIndex]?.state !== 'queued'
    ) {
      group.headIndex++;
    }

    if (group.headIndex >= group.entries.length) {
      group.entries.length = 0;
      group.headIndex = 0;
      return null;
    }

    return group.entries[group.headIndex] ?? null;
  };

  return {
    clear,
    complete,
    enqueue,
    expire,
    nextExpirationMs,
    remove,
    size,
    takeNext,
  };
};
