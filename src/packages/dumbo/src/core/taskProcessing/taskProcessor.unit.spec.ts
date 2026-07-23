import assert from 'assert';
import { beforeEach, describe, it } from 'vitest';
import { Clock } from './clock';
import { TaskProcessor, type Task } from './taskProcessor';

describe('TaskProcessor', () => {
  let taskProcessor: TaskProcessor;

  beforeEach(() => {
    taskProcessor = new TaskProcessor({
      maxActiveTasks: 2,
      maxQueueSize: 3,
    });
  });

  it('should enqueue and process a task', async () => {
    const task: Task<string> = ({ ack }: { ack: () => void }) => {
      ack();
      return Promise.resolve('Task should be processed successfully');
    };
    const result = await taskProcessor.enqueue(task);

    assert.ok(result, 'Task should be processed successfully');
  });

  it('should process multiple tasks concurrently', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(async ({ ack }) => {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate task work
        taskResults.push('Task 1 completed');
        ack();
      }),
      taskProcessor.enqueue(async ({ ack }) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        taskResults.push('Task 2 completed');
        ack();
      }),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(
      taskResults,
      ['Task 1 completed', 'Task 2 completed'],
      'All tasks should be processed concurrently',
    );
  });

  it('should process queued tasks once active tasks are completed', async () => {
    const tasks: string[] = [];

    // Enqueue 2 active tasks
    const task1 = taskProcessor.enqueue(async ({ ack }) => {
      await new Promise((resolve) => setTimeout(resolve, 200)); // Simulate task work
      tasks.push('Task 1 completed');
      ack();
    });

    const task2 = taskProcessor.enqueue(async ({ ack }) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      tasks.push('Task 2 completed');
      ack();
    });

    // Enqueue a queued task, should only process after one of the above tasks finishes
    const queuedTask = taskProcessor.enqueue(({ ack }) => {
      tasks.push('Queued Task completed');
      ack();
      return Promise.resolve();
    });

    await Promise.all([task1, task2, queuedTask]);

    const expected = [
      'Task 1 completed',
      'Task 2 completed',
      'Queued Task completed',
    ];

    assert.ok(
      tasks.every((task) => expected.includes(task)),
      'Queued task should be processed after active tasks are completed',
    );
  });

  it('should process tasks in FIFO order without taskGroupId', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(async ({ ack }) => {
        taskResults.push('Task 1 completed');
        ack();
        return Promise.resolve();
      }),
      taskProcessor.enqueue(async ({ ack }) => {
        taskResults.push('Task 2 completed');
        ack();
        return Promise.resolve();
      }),
      taskProcessor.enqueue(async ({ ack }) => {
        taskResults.push('Task 3 completed');
        ack();
        return Promise.resolve();
      }),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(
      taskResults,
      ['Task 1 completed', 'Task 2 completed', 'Task 3 completed'],
      'Tasks should be processed in FIFO order',
    );
  });

  it('should process tasks with taskGroupId sequentially', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(
        async ({ ack }) => {
          taskResults.push('Group 1 - Task 1');
          ack();
          return Promise.resolve();
        },
        { taskGroupId: 'group1' },
      ),
      taskProcessor.enqueue(
        async ({ ack }) => {
          taskResults.push('Group 1 - Task 2');
          ack();
          return Promise.resolve();
        },
        { taskGroupId: 'group1' },
      ),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(
      taskResults,
      ['Group 1 - Task 1', 'Group 1 - Task 2'],
      'Tasks with the same taskGroupId should be processed sequentially',
    );
  });

  it('should process tasks from different taskGroupIds concurrently', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate work
          taskResults.push('Group 1 - Task 1');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          taskResults.push('Group 2 - Task 1');
          ack();
        },
        { taskGroupId: 'group2' },
      ),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(
      taskResults.sort(), // Sorting because concurrent order may vary
      ['Group 1 - Task 1', 'Group 2 - Task 1'],
      'Tasks with different taskGroupIds should be processed concurrently',
    );
  });

  it('should process ungrouped tasks concurrently with grouped tasks', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate work
          taskResults.push('Grouped Task');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
      taskProcessor.enqueue(async ({ ack }) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        taskResults.push('Ungrouped Task');
        ack();
      }),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(
      taskResults.sort(),
      ['Grouped Task', 'Ungrouped Task'],
      'Ungrouped tasks should be processed concurrently with grouped tasks',
    );
  });

  it('should respect queue size limit and reject tasks when exceeded', async () => {
    const tasks = [
      taskProcessor.enqueue(({ ack }) => {
        ack();
        return Promise.resolve();
      }),
      taskProcessor.enqueue(({ ack }) => {
        ack();
        return Promise.resolve();
      }),
      taskProcessor.enqueue(({ ack }) => {
        ack();
        return Promise.resolve();
      }),
      taskProcessor.enqueue(({ ack }) => {
        ack();
        return Promise.resolve();
      }),
      taskProcessor.enqueue(({ ack }) => {
        ack();
        return Promise.resolve();
      }),
      // 5 + 1
      taskProcessor.enqueue(({ ack }) => {
        ack();
        return Promise.resolve();
      }),
    ];

    await assert.rejects(
      () => Promise.all(tasks),
      /Too many pending connections/,
      'Should reject tasks when queue size is exceeded',
    );
  });

  it('should process tasks from blocked groups in FIFO order after unblocking', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(
        async ({ ack }) => {
          taskResults.push('Group 1 - Task 1');
          await new Promise((resolve) => setTimeout(resolve, 200));
          ack();
        },
        { taskGroupId: 'group1' },
      ),
      taskProcessor.enqueue(
        async ({ ack }) => {
          taskResults.push('Group 1 - Task 2');
          ack();
          return Promise.resolve();
        },
        { taskGroupId: 'group1' },
      ),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(
      taskResults,
      ['Group 1 - Task 1', 'Group 1 - Task 2'],
      'Tasks from a blocked group should be processed in FIFO order after unblocking',
    );
  });

  // with delays

  it('should process tasks in strict FIFO order without taskGroupId', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(async ({ ack }) => {
        await new Promise((resolve) => setTimeout(resolve, 50)); // Delay to simulate processing
        taskResults.push('Task 1 completed');
        ack();
      }),
      taskProcessor.enqueue(async ({ ack }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        taskResults.push('Task 2 completed');
        ack();
      }),
      taskProcessor.enqueue(async ({ ack }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        taskResults.push('Task 3 completed');
        ack();
      }),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(
      taskResults,
      ['Task 1 completed', 'Task 2 completed', 'Task 3 completed'],
      'Tasks should be processed in strict FIFO order without taskGroupId',
    );
  });

  it('should process tasks with taskGroupId in strict FIFO order within the group', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 20)); // Simulate work
          taskResults.push('Group 1 - Task 1');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          taskResults.push('Group 1 - Task 2');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          taskResults.push('Group 2 - Task 1');
          ack();
        },
        { taskGroupId: 'group2' },
      ),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(taskResults, [
      'Group 1 - Task 1',
      'Group 1 - Task 2',
      'Group 2 - Task 1',
    ]);
  });

  it('should delay tasks from the same taskGroupId but allow other groups to process', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate longer work
          taskResults.push('Group 1 - Task 1');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          taskResults.push('Group 2 - Task 1');
          ack();
        },
        { taskGroupId: 'group2' },
      ),
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          taskResults.push('Group 1 - Task 2');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(taskResults, [
      'Group 1 - Task 1',
      'Group 2 - Task 1',
      'Group 1 - Task 2',
    ]);
  });

  it('should ensure ungrouped tasks interleave with grouped tasks based on availability', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate longer work
          taskResults.push('Group 1 - Task 1');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
      taskProcessor.enqueue(async ({ ack }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        taskResults.push('Ungrouped Task 1');
        ack();
      }),
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          taskResults.push('Group 1 - Task 2');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(taskResults, [
      'Group 1 - Task 1',
      'Ungrouped Task 1',
      'Group 1 - Task 2',
    ]);
  });

  it('should ensure blocked tasks from an active group are eventually processed', async () => {
    const taskResults: string[] = [];
    const tasks = [
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate work
          taskResults.push('Group 1 - Task 1');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
      taskProcessor.enqueue(async ({ ack }) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        taskResults.push('Ungrouped Task');
        ack();
      }),
      taskProcessor.enqueue(
        async ({ ack }) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          taskResults.push('Group 1 - Task 2');
          ack();
        },
        { taskGroupId: 'group1' },
      ),
    ];

    await Promise.all(tasks);

    assert.deepStrictEqual(taskResults, [
      'Ungrouped Task',
      'Group 1 - Task 1',
      'Group 1 - Task 2',
    ]);
  });

  it('rejects queued tasks on stop without orphaning promises', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
    });

    let releaseActiveTask: () => void = () => {};
    const activeTaskCanFinish = new Promise<void>((resolve) => {
      releaseActiveTask = resolve;
    });

    const activeTask = singleTaskProcessor.enqueue(async ({ ack }) => {
      await activeTaskCanFinish;
      ack();
      return 'active';
    });

    const queuedTask = singleTaskProcessor.enqueue(({ ack }) => {
      ack();
      return Promise.resolve('queued');
    });

    const stopPromise = singleTaskProcessor.stop();

    await assert.rejects(queuedTask, /TaskProcessor has been stopped/);

    releaseActiveTask();
    await stopPromise;
    await assert.doesNotReject(activeTask);
  });

  it('rejects queued tasks immediately on force stop', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
    });

    let releaseActiveTask: () => void = () => {};
    const activeTaskCanFinish = new Promise<void>((resolve) => {
      releaseActiveTask = resolve;
    });
    const activeTask = singleTaskProcessor.enqueue(async ({ ack }) => {
      await activeTaskCanFinish;
      ack();
      return 'active';
    });

    const queuedTask = singleTaskProcessor.enqueue(({ ack }) => {
      ack();
      return Promise.resolve('queued');
    });

    await singleTaskProcessor.stop({ force: true });

    await assert.rejects(queuedTask, /TaskProcessor has been stopped/);
    releaseActiveTask();
    await assert.doesNotReject(activeTask);
  });

  it('lets already started work run beyond the queue idle timeout', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
      maxTaskIdleTime: 10,
    });

    await assert.doesNotReject(() =>
      singleTaskProcessor.enqueue(async ({ ack }) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        ack();
        return 'active';
      }),
    );
  });

  it('does not start waiting work after the caller has timed out', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
      maxTaskIdleTime: 10,
    });

    let releaseActiveTask: () => void = () => {};
    const activeTaskCanFinish = new Promise<void>((resolve) => {
      releaseActiveTask = resolve;
    });
    const activeTask = singleTaskProcessor.enqueue(async ({ ack }) => {
      await activeTaskCanFinish;
      ack();
      return 'active';
    });

    let queuedTaskRan = false;
    const queuedTask = singleTaskProcessor.enqueue(({ ack }) => {
      queuedTaskRan = true;
      ack();
      return Promise.resolve('queued');
    });

    await assert.rejects(
      queuedTask,
      /Task was not started within the maximum waiting time/,
    );

    releaseActiveTask();
    await activeTask;
    await singleTaskProcessor.waitForEndOfProcessing();

    assert.strictEqual(queuedTaskRan, false);
  });

  it('does not start waiting work whose timeout elapsed before the scheduler ran', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
      maxTaskIdleTime: 10,
    });

    const activeTask = singleTaskProcessor.enqueue(async ({ ack }) => {
      await Promise.resolve();
      blockEventLoopFor(30);
      ack();
      return 'active';
    });

    let queuedTaskRan = false;
    const queuedTask = singleTaskProcessor.enqueue(({ ack }) => {
      queuedTaskRan = true;
      ack();
      return Promise.resolve('queued');
    });

    assert.strictEqual(await activeTask, 'active');
    await assert.rejects(
      queuedTask,
      /Task was not started within the maximum waiting time/,
    );
    assert.strictEqual(queuedTaskRan, false);
  });

  it('continues with the next waiting task after a timed out task is skipped', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
      maxTaskIdleTime: 10,
    });
    const activeTaskCanFinish = Promise.withResolvers<void>();

    const activeTask = singleTaskProcessor.enqueue(async ({ ack }) => {
      await activeTaskCanFinish.promise;
      ack();
      return 'active';
    });

    let timedOutTaskRan = false;
    const timedOutTask = singleTaskProcessor.enqueue(({ ack }) => {
      timedOutTaskRan = true;
      ack();
      return Promise.resolve('timed out');
    });

    blockEventLoopFor(30);

    let nextTaskRan = false;
    const nextTask = singleTaskProcessor.enqueue(({ ack }) => {
      nextTaskRan = true;
      ack();
      return Promise.resolve('next');
    });

    activeTaskCanFinish.resolve();

    assert.strictEqual(await activeTask, 'active');
    await assert.rejects(
      timedOutTask,
      /Task was not started within the maximum waiting time/,
    );
    assert.strictEqual(await nextTask, 'next');
    assert.strictEqual(timedOutTaskRan, false);
    assert.strictEqual(nextTaskRan, true);
  });

  it('lets another caller wait after a previous waiting caller times out', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 1,
      maxTaskIdleTime: 10,
    });

    let releaseActiveTask: () => void = () => {};
    const activeTaskCanFinish = new Promise<void>((resolve) => {
      releaseActiveTask = resolve;
    });
    const activeTask = singleTaskProcessor.enqueue(async ({ ack }) => {
      await activeTaskCanFinish;
      ack();
      return 'active';
    });

    const timedOutTask = singleTaskProcessor.enqueue(({ ack }) => {
      ack();
      return Promise.resolve('timed out');
    });

    await assert.rejects(
      timedOutTask,
      /Task was not started within the maximum waiting time/,
    );

    const replacementTask = singleTaskProcessor.enqueue(({ ack }) => {
      ack();
      return Promise.resolve('replacement');
    });

    releaseActiveTask();
    assert.strictEqual(await activeTask, 'active');
    assert.strictEqual(await replacementTask, 'replacement');
  });

  it('does not start waiting work after the caller aborts', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
    });
    const abortController = new AbortController();
    let releaseActiveTask: () => void = () => {};
    const activeTaskCanFinish = new Promise<void>((resolve) => {
      releaseActiveTask = resolve;
    });
    let queuedTaskRan = false;

    const activeTask = singleTaskProcessor.enqueue(async ({ ack }) => {
      await activeTaskCanFinish;
      ack();
      return 'active';
    });

    const queuedTask = singleTaskProcessor.enqueue(
      ({ ack }) => {
        queuedTaskRan = true;
        ack();
        return Promise.resolve('queued');
      },
      { abort: { signal: abortController.signal } },
    );

    abortController.abort(new Error('queued task aborted'));

    await assert.rejects(queuedTask, /queued task aborted/);

    releaseActiveTask();
    await activeTask;
    await singleTaskProcessor.waitForEndOfProcessing();

    assert.strictEqual(queuedTaskRan, false);
  });

  it('lets another caller wait after a previous waiting caller aborts', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 1,
    });
    const abortController = new AbortController();
    let releaseActiveTask: () => void = () => {};
    const activeTaskCanFinish = new Promise<void>((resolve) => {
      releaseActiveTask = resolve;
    });

    const activeTask = singleTaskProcessor.enqueue(async ({ ack }) => {
      await activeTaskCanFinish;
      ack();
      return 'active';
    });

    const abortedTask = singleTaskProcessor.enqueue(
      ({ ack }) => {
        ack();
        return Promise.resolve('aborted');
      },
      { abort: { signal: abortController.signal } },
    );

    abortController.abort(new Error('queued task aborted'));

    await assert.rejects(abortedTask, /queued task aborted/);

    const replacementTask = singleTaskProcessor.enqueue(({ ack }) => {
      ack();
      return Promise.resolve('replacement');
    });

    releaseActiveTask();
    assert.strictEqual(await activeTask, 'active');
    assert.strictEqual(await replacementTask, 'replacement');
  });

  it('keeps leased capacity unavailable until the caller releases it', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
    });

    let releaseSlot: () => void = () => {};
    let queuedTaskRan = false;

    const activeTask = singleTaskProcessor.enqueue(({ ack }) => {
      releaseSlot = ack;
      return Promise.resolve('active');
    });
    const queuedTask = singleTaskProcessor.enqueue(({ ack }) => {
      queuedTaskRan = true;
      ack();
      return Promise.resolve('queued');
    });

    assert.strictEqual(await activeTask, 'active');
    assert.strictEqual(queuedTaskRan, false);

    releaseSlot();

    assert.strictEqual(await queuedTask, 'queued');
    assert.strictEqual(queuedTaskRan, true);
  });

  it('continues processing work after a task fails during setup', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
    });

    await assert.rejects(
      () =>
        singleTaskProcessor.enqueue(() => {
          throw new Error('setup failed');
        }),
      /setup failed/,
    );

    const nextTask = await singleTaskProcessor.enqueue(({ ack }) => {
      ack();
      return Promise.resolve('next task completed');
    });

    assert.strictEqual(nextTask, 'next task completed');
  });

  it('continues processing work after a running task rejects', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
    });

    await assert.rejects(
      () =>
        singleTaskProcessor.enqueue(() => {
          return Promise.reject(new Error('task failed'));
        }),
      /task failed/,
    );

    const nextTask = await singleTaskProcessor.enqueue(({ ack }) => {
      ack();
      return Promise.resolve('next task completed');
    });

    assert.strictEqual(nextTask, 'next task completed');
  });

  it('aborts active task context on force stop', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
    });

    const activeTask = singleTaskProcessor.enqueue(({ abort: { signal } }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new Error(String(signal.reason)),
          );
        });
      });
    });

    await singleTaskProcessor.stop({ force: true });

    await assert.rejects(activeTask, /TaskProcessor has been stopped/);
  });

  it('does not abort active task context on graceful stop', async () => {
    const singleTaskProcessor = new TaskProcessor({
      maxActiveTasks: 1,
      maxQueueSize: 10,
    });

    let releaseActiveTask: () => void = () => {};
    const activeTaskCanFinish = new Promise<void>((resolve) => {
      releaseActiveTask = resolve;
    });
    let wasAborted = false;

    const activeTask = singleTaskProcessor.enqueue(
      async ({ ack, abort: { signal } }) => {
        signal.addEventListener('abort', () => {
          wasAborted = true;
        });
        await activeTaskCanFinish;
        ack();
        return 'active';
      },
    );

    const stopPromise = singleTaskProcessor.stop();
    releaseActiveTask();
    await stopPromise;

    assert.strictEqual(await activeTask, 'active');
    assert.strictEqual(wasAborted, false);
  });
});

const blockEventLoopFor = (timeoutMs: number): void => {
  const startedAt = Clock.now();
  while (Clock.now() - startedAt < timeoutMs) {
    // Keep the event loop busy so pending timers cannot run first.
  }
};
