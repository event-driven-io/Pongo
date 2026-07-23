import assert from 'assert';
import { describe, it } from 'vitest';
import { taskScheduler } from './taskScheduler';
import type { TaskQueueItem } from './taskProcessor';

describe('taskScheduler', () => {
  it('starts callers in the order they arrived when no group is busy', () => {
    const scheduler = taskScheduler();
    const first = queuedTask('first');
    const second = queuedTask('second');
    const third = queuedTask('third');

    scheduler.enqueue(first);
    scheduler.enqueue(second);
    scheduler.enqueue(third);

    assert.strictEqual(scheduler.takeNext(), first);
    assert.strictEqual(scheduler.takeNext(), second);
    assert.strictEqual(scheduler.takeNext(), third);
    assert.strictEqual(scheduler.takeNext(), null);
  });

  it('keeps a caller waiting while earlier work from the same group is running', () => {
    const scheduler = taskScheduler();
    const first = queuedTask('first', { taskGroupId: 'account' });
    const second = queuedTask('second', { taskGroupId: 'account' });

    scheduler.enqueue(first);
    assert.strictEqual(scheduler.takeNext(), first);

    scheduler.enqueue(second);

    assert.strictEqual(scheduler.takeNext(), null);

    scheduler.complete(first);

    assert.strictEqual(scheduler.takeNext(), second);
  });

  it('starts an older grouped caller before newer work after its group becomes available', () => {
    const scheduler = taskScheduler();
    const active = queuedTask('active', { taskGroupId: 'account' });
    const olderGrouped = queuedTask('older grouped', {
      taskGroupId: 'account',
    });
    const newerUngrouped = queuedTask('newer ungrouped');

    scheduler.enqueue(active);
    assert.strictEqual(scheduler.takeNext(), active);

    scheduler.enqueue(olderGrouped);
    scheduler.enqueue(newerUngrouped);
    scheduler.complete(active);

    assert.strictEqual(scheduler.takeNext(), olderGrouped);
    assert.strictEqual(scheduler.takeNext(), newerUngrouped);
  });

  it('keeps a newer grouped caller waiting until older waiting work from that group starts first', () => {
    const scheduler = taskScheduler();
    const active = queuedTask('active', { taskGroupId: 'account' });
    const olderGrouped = queuedTask('older grouped', {
      taskGroupId: 'account',
    });
    const newerGrouped = queuedTask('newer grouped', {
      taskGroupId: 'account',
    });

    scheduler.enqueue(active);
    assert.strictEqual(scheduler.takeNext(), active);

    scheduler.enqueue(olderGrouped);
    scheduler.enqueue(newerGrouped);
    scheduler.complete(active);

    assert.strictEqual(scheduler.takeNext(), olderGrouped);
    assert.strictEqual(scheduler.takeNext(), null);

    scheduler.complete(olderGrouped);

    assert.strictEqual(scheduler.takeNext(), newerGrouped);
  });

  it('lets the next caller start after a waiting caller leaves', () => {
    const scheduler = taskScheduler();
    const leaving = queuedTask('leaving');
    const next = queuedTask('next');

    scheduler.enqueue(leaving);
    scheduler.enqueue(next);

    assert.strictEqual(scheduler.remove(leaving), true);
    assert.strictEqual(scheduler.size(), 1);
    assert.strictEqual(scheduler.takeNext(), next);
    assert.strictEqual(scheduler.remove(leaving), false);
  });

  it('lets the next grouped caller start after an older grouped caller leaves', () => {
    const scheduler = taskScheduler();
    const active = queuedTask('active', { taskGroupId: 'account' });
    const leaving = queuedTask('leaving', { taskGroupId: 'account' });
    const next = queuedTask('next', { taskGroupId: 'account' });

    scheduler.enqueue(active);
    assert.strictEqual(scheduler.takeNext(), active);
    scheduler.enqueue(leaving);
    scheduler.enqueue(next);

    assert.strictEqual(scheduler.remove(leaving), true);
    scheduler.complete(active);

    assert.strictEqual(scheduler.takeNext(), next);
  });

  it('lets the next grouped caller start after an older grouped caller expires', () => {
    const scheduler = taskScheduler();
    const expired = queuedTask('expired', { taskGroupId: 'account' }, 10);
    const next = queuedTask('next', { taskGroupId: 'account' }, 30);

    scheduler.enqueue(expired);
    scheduler.enqueue(next);

    assert.deepStrictEqual(scheduler.expire(20), [expired]);
    assert.strictEqual(scheduler.takeNext(), next);
  });

  it('does not remove a caller that already started', () => {
    const scheduler = taskScheduler();
    const active = queuedTask('active', { taskGroupId: 'account' });

    scheduler.enqueue(active);

    assert.strictEqual(scheduler.takeNext(), active);
    assert.strictEqual(scheduler.remove(active), false);
  });

  it('ignores completion for work it did not start', () => {
    const scheduler = taskScheduler();
    const active = queuedTask('active', { taskGroupId: 'account' });
    const waiting = queuedTask('waiting', { taskGroupId: 'account' });
    const unknown = queuedTask('unknown', { taskGroupId: 'account' });

    scheduler.enqueue(active);
    assert.strictEqual(scheduler.takeNext(), active);
    scheduler.enqueue(waiting);

    scheduler.complete(unknown);

    assert.strictEqual(scheduler.takeNext(), null);
  });

  it('does not let an active caller expire after it has started', () => {
    const scheduler = taskScheduler();
    const active = queuedTask('active', undefined, 10);

    scheduler.enqueue(active);

    assert.strictEqual(scheduler.takeNext(), active);
    assert.deepStrictEqual(scheduler.expire(20), []);
    assert.strictEqual(scheduler.size(), 0);
  });

  it('updates the next timeout after a waiting caller leaves', () => {
    const scheduler = taskScheduler();
    const leaving = queuedTask('leaving', undefined, 10);
    const next = queuedTask('next', undefined, 30);

    scheduler.enqueue(leaving);
    scheduler.enqueue(next);

    assert.strictEqual(scheduler.remove(leaving), true);
    assert.strictEqual(scheduler.nextExpirationMs(), 30);
  });

  it('updates the next timeout after a waiting caller starts', () => {
    const scheduler = taskScheduler();
    const starting = queuedTask('starting', undefined, 10);
    const next = queuedTask('next', undefined, 30);

    scheduler.enqueue(starting);
    scheduler.enqueue(next);

    assert.strictEqual(scheduler.takeNext(), starting);
    assert.strictEqual(scheduler.nextExpirationMs(), 30);
  });

  it('does not wait for a deadline when callers can wait indefinitely', () => {
    const scheduler = taskScheduler();

    scheduler.enqueue(queuedTask('waiting'));

    assert.strictEqual(scheduler.nextExpirationMs(), null);
  });

  it('ignores the same caller when it is enqueued again', () => {
    const scheduler = taskScheduler();
    const caller = queuedTask('caller');

    scheduler.enqueue(caller);
    scheduler.enqueue(caller);

    assert.strictEqual(scheduler.size(), 1);
    assert.strictEqual(scheduler.takeNext(), caller);
    assert.strictEqual(scheduler.takeNext(), null);
  });

  it('uses the earliest waiting deadline for the next timeout', () => {
    const scheduler = taskScheduler();
    const later = queuedTask('later', undefined, 50);
    const earlier = queuedTask('earlier', undefined, 10);

    scheduler.enqueue(later);
    scheduler.enqueue(earlier);

    assert.strictEqual(scheduler.nextExpirationMs(), 10);
  });

  it('leaves waiting callers alone before their deadline passes', () => {
    const scheduler = taskScheduler();
    const waiting = queuedTask('waiting', undefined, 30);

    scheduler.enqueue(waiting);

    assert.deepStrictEqual(scheduler.expire(20), []);
    assert.strictEqual(scheduler.size(), 1);
    assert.strictEqual(scheduler.takeNext(), waiting);
  });

  it('skips expired waiting callers and continues with the next caller', () => {
    const scheduler = taskScheduler();
    const expired = queuedTask('expired', undefined, 10);
    const next = queuedTask('next', undefined, 30);

    scheduler.enqueue(expired);
    scheduler.enqueue(next);

    assert.deepStrictEqual(scheduler.expire(20), [expired]);
    assert.strictEqual(scheduler.size(), 1);
    assert.strictEqual(scheduler.takeNext(), next);
  });

  it('expires waiting callers in the order they arrived', () => {
    const scheduler = taskScheduler();
    const first = queuedTask('first', undefined, 10);
    const second = queuedTask('second', undefined, 10);

    scheduler.enqueue(first);
    scheduler.enqueue(second);

    assert.deepStrictEqual(scheduler.expire(10), [first, second]);
  });

  it('lets newer work continue after an older caller expires behind a busy group', () => {
    const scheduler = taskScheduler();
    const active = queuedTask('active', { taskGroupId: 'account' });
    const expiredGrouped = queuedTask(
      'expired grouped',
      { taskGroupId: 'account' },
      10,
    );
    const next = queuedTask('next', undefined, 30);

    scheduler.enqueue(active);
    assert.strictEqual(scheduler.takeNext(), active);
    scheduler.enqueue(expiredGrouped);
    scheduler.enqueue(next);

    assert.deepStrictEqual(scheduler.expire(20), [expiredGrouped]);
    scheduler.complete(active);

    assert.strictEqual(scheduler.takeNext(), next);
  });

  it('clears only callers that are still waiting', () => {
    const scheduler = taskScheduler();
    const active = queuedTask('active', { taskGroupId: 'account' });
    const waiting = queuedTask('waiting', { taskGroupId: 'account' });

    scheduler.enqueue(active);
    assert.strictEqual(scheduler.takeNext(), active);
    scheduler.enqueue(waiting);

    assert.deepStrictEqual(scheduler.clear(), [waiting]);
    assert.strictEqual(scheduler.size(), 0);

    scheduler.complete(active);

    assert.strictEqual(scheduler.takeNext(), null);
  });

  it('keeps capacity accurate after clearing waiting callers', () => {
    const scheduler = taskScheduler();
    const first = queuedTask('first');
    const second = queuedTask('second', { taskGroupId: 'account' });

    scheduler.enqueue(first);
    scheduler.enqueue(second);

    assert.deepStrictEqual(scheduler.clear(), [first, second]);
    assert.strictEqual(scheduler.size(), 0);
    assert.strictEqual(scheduler.takeNext(), null);
  });

  it('does not expire callers after waiting work is cleared', () => {
    const scheduler = taskScheduler();
    const waiting = queuedTask('waiting', undefined, 10);

    scheduler.enqueue(waiting);
    scheduler.clear();

    assert.deepStrictEqual(scheduler.expire(20), []);
    assert.strictEqual(scheduler.nextExpirationMs(), null);
  });
});

const queuedTask = (
  _name: string,
  options?: TaskQueueItem['options'],
  expiresAtMs?: number,
): TaskQueueItem => ({
  abort: () => {},
  markStarted: () => {},
  options,
  reject: () => {},
  task: () => Promise.resolve(),
  ...(expiresAtMs !== undefined ? { expiresAtMs } : {}),
});
