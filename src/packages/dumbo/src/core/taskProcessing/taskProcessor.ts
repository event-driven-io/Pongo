import { DumboError, TransientDatabaseError } from '../errors';

export type TaskQueue = TaskQueueItem[];

export type TaskQueueItem = {
  task: () => Promise<void>;
  reject: (reason: unknown) => void;
  markStarted: () => void;
  options?: EnqueueTaskOptions | undefined;
};

export type TaskProcessorOptions = {
  maxActiveTasks: number;
  maxQueueSize: number;
  maxTaskIdleTime?: number;
  abortController?: AbortController;
};

export type Task<T> = (context: TaskContext) => Promise<T>;

export type OperationContext = {
  signal: AbortSignal;
};

export type TaskContext = OperationContext & {
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
  private abortController: AbortController;

  constructor(options: TaskProcessorOptions) {
    this.options = options;
    this.abortController = options.abortController ?? new AbortController();
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
    return this.schedule(({ ack }) => Promise.resolve(ack()));
  }

  async stop(options?: {
    force?: boolean;
    closeDeadline?: number;
  }): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const cancelled = this.queue.splice(0);
    this.activeGroups.clear();
    const reason = new DumboError('TaskProcessor has been stopped');
    for (const item of cancelled) item.reject(reason);

    // Signal cooperative tasks to wrap up before we wait for them. Honest user
    // code listening for abort can return early; uncooperative tasks fall back
    // to the closeDeadline race below.
    this.abortController.abort(reason);

    if (options?.force) return;

    const drained = this.waitForEndOfProcessing().catch(() => undefined);
    if (options?.closeDeadline !== undefined) {
      await Promise.race([drained, delay(options.closeDeadline)]);
    } else {
      await drained;
    }
  }

  private schedule<T>(task: Task<T>, options?: EnqueueTaskOptions): Promise<T> {
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    silenceUnhandledRejection(promise);

    const queueWaitTimer = createQueueWaitTimer(
      this.options.maxTaskIdleTime,
      reject,
    );

    const taskWithContext = () =>
      new Promise<void>((resolveTask, failTask) => {
        const taskPromise = task({
          ack: resolveTask,
          signal: this.abortController.signal,
        });

        taskPromise
          .then((value) => {
            queueWaitTimer.cancel();
            resolve(value);
          })
          .catch((err) => {
            queueWaitTimer.cancel();
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            failTask(err);
            reject(err);
          });
      });

    this.queue.push({
      task: taskWithContext,
      reject: (reason) => {
        queueWaitTimer.cancel();
        reject(reason);
      },
      markStarted: queueWaitTimer.cancel,
      options,
    });
    if (!this.isProcessing) {
      this.ensureProcessing();
    }

    return promise;
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

  private async executeItem(item: TaskQueueItem): Promise<void> {
    item.markStarted();
    try {
      await item.task();
    } finally {
      this.activeTasks--;

      // Mark the group as inactive after task completion
      if (item.options && item.options.taskGroupId) {
        this.activeGroups.delete(item.options.taskGroupId);
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

const silenceUnhandledRejection = (promise: Promise<unknown>): void => {
  void promise.catch(() => {});
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const handle = setTimeout(resolve, ms);
    handle.unref();
  });

type QueueWaitTimer = { cancel: () => void };

const createQueueWaitTimer = (
  timeoutMs: number | undefined,
  reject: (reason: unknown) => void,
): QueueWaitTimer => {
  if (timeoutMs === undefined) return { cancel: () => {} };

  let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
    reject(
      new TransientDatabaseError(
        'Task was not started within the maximum waiting time',
      ),
    );
  }, timeoutMs);
  timeoutId.unref();

  return {
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
};
