import assert from 'node:assert';
import { describe, it } from 'vitest';
import { queuedTaskExpiration } from './queuedTaskExpiration';
import type { TaskQueue, TaskQueueItem } from './taskProcessor';

describe('queuedTaskExpiration', () => {
  it('does not set deadlines when queued tasks are allowed to wait indefinitely', () => {
    const expireQueuedTasks = queuedTaskExpiration({
      queue: [],
      maxTaskIdleTime: undefined,
      expire: () => {},
      onExpired: () => {},
    });

    assert.strictEqual(expireQueuedTasks.deadlineForNewTask(), undefined);
  });

  it('sets a deadline for new queued tasks from the configured idle timeout', () => {
    const expireQueuedTasks = queuedTaskExpiration({
      queue: [],
      maxTaskIdleTime: 100,
      expire: () => {},
      onExpired: () => {},
    });

    const before = Date.now();
    const expiresAt = expireQueuedTasks.deadlineForNewTask();
    const after = Date.now();

    assert.ok(expiresAt);
    assert.ok(expiresAt >= before + 100);
    assert.ok(expiresAt <= after + 100);
  });

  it('expires queued tasks after their deadline passes', async () => {
    const expiredTasks: TaskQueueItem[] = [];
    let didNotifyProcessor = false;
    const task = taskQueueItem({ expiresAt: Date.now() + 10 });
    const queue: TaskQueue = [task];
    const expireQueuedTasks = queuedTaskExpiration({
      queue,
      maxTaskIdleTime: 10,
      expire: (item) => {
        expiredTasks.push(item);
      },
      onExpired: () => {
        didNotifyProcessor = true;
      },
    });

    expireQueuedTasks.schedule();
    await wait(30);

    assert.deepStrictEqual(expiredTasks, [task]);
    assert.deepStrictEqual(queue, []);
    assert.strictEqual(didNotifyProcessor, true);
  });

  it('leaves queued tasks waiting until their own deadline passes', async () => {
    const expiredTasks: TaskQueueItem[] = [];
    const firstToExpire = taskQueueItem({ expiresAt: Date.now() + 10 });
    const stillWaiting = taskQueueItem({ expiresAt: Date.now() + 50 });
    const queue: TaskQueue = [stillWaiting, firstToExpire];
    const expireQueuedTasks = queuedTaskExpiration({
      queue,
      maxTaskIdleTime: 10,
      expire: (item) => {
        expiredTasks.push(item);
      },
      onExpired: () => {},
    });

    expireQueuedTasks.schedule();
    await wait(30);

    assert.deepStrictEqual(expiredTasks, [firstToExpire]);
    assert.deepStrictEqual(queue, [stillWaiting]);

    await wait(40);

    assert.deepStrictEqual(expiredTasks, [firstToExpire, stillWaiting]);
    assert.deepStrictEqual(queue, []);
  });

  it('lets the processor reject an expired task before starting it', () => {
    const task = taskQueueItem({ expiresAt: Date.now() - 1 });
    const expiredTasks: TaskQueueItem[] = [];
    let didNotifyProcessor = false;
    const expireQueuedTasks = queuedTaskExpiration({
      queue: [],
      maxTaskIdleTime: 10,
      expire: (item) => {
        expiredTasks.push(item);
      },
      onExpired: () => {
        didNotifyProcessor = true;
      },
    });

    const didExpire = expireQueuedTasks.rejectIfExpired(task);

    assert.strictEqual(didExpire, true);
    assert.deepStrictEqual(expiredTasks, [task]);
    assert.strictEqual(didNotifyProcessor, true);
  });

  it('lets the processor start a task that has not expired', () => {
    const task = taskQueueItem({ expiresAt: Date.now() + 100 });
    const expiredTasks: TaskQueueItem[] = [];
    let didNotifyProcessor = false;
    const expireQueuedTasks = queuedTaskExpiration({
      queue: [],
      maxTaskIdleTime: 10,
      expire: (item) => {
        expiredTasks.push(item);
      },
      onExpired: () => {
        didNotifyProcessor = true;
      },
    });

    const didExpire = expireQueuedTasks.rejectIfExpired(task);

    assert.strictEqual(didExpire, false);
    assert.deepStrictEqual(expiredTasks, []);
    assert.strictEqual(didNotifyProcessor, false);
  });

  it('stops expiring queued tasks after expiration is cancelled', async () => {
    const expiredTasks: TaskQueueItem[] = [];
    const task = taskQueueItem({ expiresAt: Date.now() + 10 });
    const queue: TaskQueue = [task];
    const expireQueuedTasks = queuedTaskExpiration({
      queue,
      maxTaskIdleTime: 10,
      expire: (item) => {
        expiredTasks.push(item);
      },
      onExpired: () => {},
    });

    expireQueuedTasks.schedule();
    expireQueuedTasks.cancel();
    await wait(30);

    assert.deepStrictEqual(expiredTasks, []);
    assert.deepStrictEqual(queue, [task]);
  });
});

const taskQueueItem = ({
  expiresAt,
}: {
  expiresAt?: number;
} = {}): TaskQueueItem => ({
  task: async () => {},
  ...(expiresAt !== undefined ? { expiresAt } : {}),
  reject: () => {},
  markStarted: () => {},
  abort: () => {},
});

const wait = (timeoutMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, timeoutMs));
