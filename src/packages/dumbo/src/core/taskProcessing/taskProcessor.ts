import { TransientDatabaseError } from '../errors';

export type TaskQueue = TaskQueueItem[];

export type TaskQueueItem = {
  task: () => Promise<void>;
  options?: EnqueueTaskOptions | undefined;
};

export type TaskProcessorOptions = {
  maxActiveTasks: number;
  maxQueueSize: number;
  maxTaskIdleTime?: number;
};

export type Task<T> = (context: TaskContext) => Promise<T>;

export type TaskContext = {
  ack: () => void;
};

export type EnqueueTaskOptions = { taskGroupId?: string };

export class TaskProcessor {
  private queue: TaskQueue = [];
  private isProcessing = false;
  private activeTasks = 0;
  private activeGroups: Set<string> = new Set();
  private options: TaskProcessorOptions;

  constructor(options: TaskProcessorOptions) {
    this.options = options;
  }

  enqueue<T>(task: Task<T>, options?: EnqueueTaskOptions): Promise<T> {
    if (this.queue.length >= this.options.maxQueueSize) {
      return Promise.reject(
        new TransientDatabaseError(
          'Too many pending connections. Please try again later.',
        ),
      );
    }

    return this.schedule(task, options);
  }

  waitForEndOfProcessing(): Promise<void> {
    return this.schedule(({ ack }) => Promise.resolve(ack()));
  }

  private schedule<T>(task: Task<T>, options?: EnqueueTaskOptions): Promise<T> {
    return promiseWithDeadline(
      (resolve, reject) => {
        const taskWithContext = () => {
          return new Promise<void>((resolveTask, failTask) => {
            const taskPromise = task({
              ack: resolveTask,
            });

            taskPromise.then(resolve).catch((err) => {
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
              failTask(err);
              reject(err);
            });
          });
        };

        this.queue.push({ task: taskWithContext, options });
        if (!this.isProcessing) {
          this.ensureProcessing();
        }
      },
      { deadline: this.options.maxTaskIdleTime },
    );
  }

  private ensureProcessing(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.processQueue();
  }

  private processQueue(): void {
    try {
      while (
        this.activeTasks < this.options.maxActiveTasks &&
        this.queue.length > 0
      ) {
        const item = this.takeFirstAvailableItem();

        if (item === null) return;

        const groupId = item.options?.taskGroupId;

        if (groupId) {
          // Mark the group as active
          this.activeGroups.add(groupId);
        }

        this.activeTasks++;
        void this.executeItem(item);
      }
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      this.isProcessing = false;
      if (
        this.hasItemsToProcess() &&
        this.activeTasks < this.options.maxActiveTasks
      ) {
        this.ensureProcessing();
      }
    }
  }

  private async executeItem({ task, options }: TaskQueueItem): Promise<void> {
    try {
      await task();
    } finally {
      this.activeTasks--;

      // Mark the group as inactive after task completion
      if (options && options.taskGroupId) {
        this.activeGroups.delete(options.taskGroupId);
      }

      this.ensureProcessing();
    }
  }

  private takeFirstAvailableItem = (): TaskQueueItem | null => {
    const taskIndex = this.queue.findIndex(
      (item) =>
        !item.options?.taskGroupId ||
        !this.activeGroups.has(item.options.taskGroupId),
    );

    if (taskIndex === -1) {
      // All remaining tasks are blocked by active groups
      return null;
    }

    // Remove the task from the queue
    const [item] = this.queue.splice(taskIndex, 1);

    return item ?? null;
  };

  private hasItemsToProcess = (): boolean =>
    this.queue.findIndex(
      (item) =>
        !item.options?.taskGroupId ||
        !this.activeGroups.has(item.options.taskGroupId),
    ) !== -1;
}

const DEFAULT_PROMISE_DEADLINE = 2147483647;

const promiseWithDeadline = <T>(
  executor: (
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: unknown) => void,
  ) => void,
  options: { deadline?: number | undefined },
) => {
  return new Promise<T>((resolve, reject) => {
    let taskStarted = false;

    const maxWaitingTime = options.deadline || DEFAULT_PROMISE_DEADLINE;

    let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
      if (!taskStarted) {
        reject(
          new Error('Task was not started within the maximum waiting time'),
        );
      }
    }, maxWaitingTime);

    executor((value) => {
      taskStarted = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = null;
      resolve(value);
    }, reject);
  });
};
