import { DumboError, TransientDatabaseError } from '../errors';

export type TaskQueue = TaskQueueItem[];

export type TaskQueueItem = {
  task: () => Promise<void>;
  options?: EnqueueTaskOptions | undefined;
  reject: (reason?: unknown) => void;
  markStarted: () => void;
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
  private stopped = false;
  private idleWaiters: Array<() => void> = [];

  constructor(options: TaskProcessorOptions) {
    this.options = options;
  }

  enqueue<T>(task: Task<T>, options?: EnqueueTaskOptions): Promise<T> {
    if (this.stopped) {
      return Promise.reject(new DumboError('TaskProcessor has been stopped'));
    }

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
    if (this.activeTasks === 0 && this.queue.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  async stop(options?: { force?: boolean }): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const stoppedError = new DumboError('TaskProcessor has been stopped');
    for (const item of this.queue.splice(0)) {
      item.reject(stoppedError);
    }
    this.activeGroups.clear();

    if (!options?.force) {
      await this.waitForEndOfProcessing();
    }
  }

  private schedule<T>(task: Task<T>, options?: EnqueueTaskOptions): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let didQueueTimeout = false;
      const queueWaitTimer = createQueueWaitTimer(
        this.options.maxTaskIdleTime,
        (reason) => {
          didQueueTimeout = true;
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(reason);
        },
      );

      const taskWithContext = () => {
        return new Promise<void>((resolveTask, failTask) => {
          if (didQueueTimeout) {
            resolveTask();
            return;
          }

          const taskPromise = task({
            ack: resolveTask,
          });

          taskPromise.then(resolve).catch((err) => {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            failTask(err);
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(err);
          });
        });
      };

      this.queue.push({
        task: taskWithContext,
        options,
        reject: (reason) => {
          queueWaitTimer.cancel();
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(reason);
        },
        markStarted: queueWaitTimer.cancel,
      });
      if (!this.isProcessing) {
        this.ensureProcessing();
      }
    });
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

  private async executeItem({
    task,
    options,
    markStarted,
  }: TaskQueueItem): Promise<void> {
    markStarted();
    try {
      await task();
    } finally {
      this.activeTasks--;

      // Mark the group as inactive after task completion
      if (options && options.taskGroupId) {
        this.activeGroups.delete(options.taskGroupId);
      }

      this.resolveIdleWaiters();
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

  private resolveIdleWaiters = (): void => {
    if (this.activeTasks > 0 || this.queue.length > 0) return;

    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  };
}

type QueueWaitTimer = { cancel: () => void };

const createQueueWaitTimer = (
  timeoutMs: number | undefined,
  reject: (reason: unknown) => void,
): QueueWaitTimer => {
  if (timeoutMs === undefined) return { cancel: () => {} };

  let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
    reject(new Error('Task was not started within the maximum waiting time'));
  }, timeoutMs);
  timeoutId.unref();

  return {
    cancel: () => {
      if (!timeoutId) return;
      clearTimeout(timeoutId);
      timeoutId = null;
    },
  };
};
