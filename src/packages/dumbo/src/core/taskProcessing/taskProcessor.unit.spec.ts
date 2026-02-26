import assert from 'assert';
import { beforeEach, describe, it } from 'node:test';
import { TaskProcessor, type Task } from './taskProcessor';

void describe('TaskProcessor', () => {
  let taskProcessor: TaskProcessor;

  beforeEach(() => {
    taskProcessor = new TaskProcessor({
      maxActiveTasks: 2,
      maxQueueSize: 3,
    });
  });

  void it('should enqueue and process a task', async () => {
    const task: Task<string> = ({ ack }: { ack: () => void }) => {
      ack();
      return Promise.resolve('Task should be processed successfully');
    };
    const result = await taskProcessor.enqueue(task);

    assert.ok(result, 'Task should be processed successfully');
  });

  void it('should process multiple tasks concurrently', async () => {
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

  void it('should process queued tasks once active tasks are completed', async () => {
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

  void it('should process tasks in FIFO order without taskGroupId', async () => {
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

  void it('should process tasks with taskGroupId sequentially', async () => {
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

  void it('should process tasks from different taskGroupIds concurrently', async () => {
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

  void it('should process ungrouped tasks concurrently with grouped tasks', async () => {
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

  void it('should respect queue size limit and reject tasks when exceeded', async () => {
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

  void it('should process tasks from blocked groups in FIFO order after unblocking', async () => {
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

  void it('should process tasks in strict FIFO order without taskGroupId', async () => {
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

  void it('should process tasks with taskGroupId in strict FIFO order within the group', async () => {
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

  void it('should delay tasks from the same taskGroupId but allow other groups to process', async () => {
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

  void it('should ensure ungrouped tasks interleave with grouped tasks based on availability', async () => {
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

  void it('should ensure blocked tasks from an active group are eventually processed', async () => {
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
});
