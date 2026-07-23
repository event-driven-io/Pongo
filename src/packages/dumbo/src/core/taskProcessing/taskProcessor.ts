import { DumboError, TransientDatabaseError } from '../errors';
import { Abort } from './abort';
import type { AbortOptions } from './abort';
import {
  queuedTaskExpiration,
  type QueuedTaskExpiration,
} from './queuedTaskExpiration';

export type TaskQueue = TaskQueueItem[];

export type TaskQueueItem = {
  task: () => Promise<void>;
  options?: EnqueueTaskOptions | undefined;
  expiresAtMs?: number | undefined;
  reject: (reason?: unknown) => void;
  markStarted: () => void;
  abort: (reason?: unknown) => void;
};

export type TaskProcessorOptions = {
  maxActiveTasks: number;
  maxQueueSize: number;
  maxTaskIdleTime?: number;
  logger?: TaskProcessorLogger;
};

export type TaskProcessorLogger = {
  error: (...args: unknown[]) => void;
};

export type Task<T> = (context: TaskContext) => Promise<T>;

export type TaskContext = {
  abort: Abort;
  release: () => void;
};

export type EnqueueTaskOptions = {
  releaseMode?: 'auto' | 'manual';
  taskGroupId?: string;
};
export type TaskOperationOptions = EnqueueTaskOptions & AbortOptions;

export type StopTaskProcessorOptions = {
  force?: boolean;
  closeDeadline?: number;
};

export class TaskProcessor {
  private queue: TaskQueue = [];
  private isProcessing = false;
  private activeTasks = 0;
  private activeGroups: Set<string> = new Set();
  private options: TaskProcessorOptions;
  private stopped = false;
  private idleWaiters: Array<() => void> = [];
  private activeTaskAbortCallbacks: Set<(reason?: unknown) => void> = new Set();
  private expireQueuedTasks: QueuedTaskExpiration;
  private logger: TaskProcessorLogger;

  constructor(options: TaskProcessorOptions) {
    this.options = options;
    this.logger = options.logger ?? console;
    this.expireQueuedTasks = queuedTaskExpiration({
      queue: this.queue,
      maxTaskIdleTime: options.maxTaskIdleTime,
      expire: (item, reason) => {
        item.abort(reason);
        item.reject(reason);
      },
      onExpired: () => {
        this.resolveIdleWaiters();
        this.ensureProcessing();
      },
    });
  }

  enqueue<T>(task: Task<T>, options?: TaskOperationOptions): Promise<T> {
    if (options?.abort?.signal.aborted) {
      return Promise.reject(Abort.reason(options.abort.signal));
    }

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

  async stop(options?: StopTaskProcessorOptions): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    const stoppedError = new DumboError('TaskProcessor has been stopped');
    for (const item of this.queue.splice(0)) {
      item.abort(stoppedError);
      item.reject(stoppedError);
    }
    this.expireQueuedTasks.cancel();
    this.activeGroups.clear();

    if (options?.force) {
      for (const abort of this.activeTaskAbortCallbacks) {
        abort(stoppedError);
      }
    }

    if (options?.force) return;

    if (options?.closeDeadline === undefined) {
      await this.waitForEndOfProcessing();
      return;
    }

    const didDrain = await waitForProcessingOrDeadline(
      this.waitForEndOfProcessing(),
      options.closeDeadline,
    );

    if (!didDrain) {
      for (const abort of this.activeTaskAbortCallbacks) {
        abort(stoppedError);
      }
    }
  }

  private schedule<T>(
    task: Task<T>,
    options?: TaskOperationOptions,
  ): Promise<T> {
    const { promise, resolve, reject } = createDeferred<T>();
    let didAbortBeforeStart = false;
    let didStart = false;
    let queuedItem: TaskQueueItem | null = null;

    const abortScope = Abort.scope(options?.abort, (reason) => {
      didAbortBeforeStart = !didStart;
      if (didAbortBeforeStart && queuedItem) {
        this.removeQueuedItem(queuedItem);
        abortScope.dispose();
        this.resolveIdleWaiters();
      }
      reject(reason);
    });

    const taskWithContext = () => {
      return new Promise<void>((resolveTask) => {
        let didRelease = false;
        const release = () => {
          if (didRelease) return;
          didRelease = true;
          resolveTask();
        };

        if (didAbortBeforeStart) {
          release();
          return;
        }

        let taskPromise: Promise<T>;
        try {
          taskPromise = task({
            abort: abortScope,
            release,
          });
        } catch (err) {
          abortScope.dispose();
          release();

          reject(err);
          return;
        }

        taskPromise
          .then((result) => {
            abortScope.dispose();
            resolve(result);
            if (options?.releaseMode !== 'manual') {
              release();
            }
          })
          .catch((err) => {
            abortScope.dispose();
            release();

            reject(err);
          });
      });
    };
    const expiresAtMs = this.expireQueuedTasks.deadlineForNewTask();

    queuedItem = {
      task: taskWithContext,
      options,
      ...(expiresAtMs !== undefined ? { expiresAtMs } : {}),
      reject: (reason) => {
        abortScope.dispose();

        reject(reason);
      },
      markStarted: () => {
        didStart = true;
      },
      abort: (reason) => {
        abortScope.dispose();
        abortScope.abort(reason);
      },
    };
    this.queue.push(queuedItem);
    this.expireQueuedTasks.schedule();
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
        if (this.expireQueuedTasks.rejectIfExpired(item)) continue;

        const groupId = item.options?.taskGroupId;

        if (groupId) {
          // Mark the group as active
          this.activeGroups.add(groupId);
        }

        this.activeTasks++;
        void this.executeItem(item).catch((err) => {
          this.logger.error(
            'TaskProcessor caught unhandled task rejection:',
            err,
          );
        });
      }
    } catch (error) {
      this.logger.error(error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeItem({
    task,
    options,
    markStarted,
    abort,
  }: TaskQueueItem): Promise<void> {
    markStarted();
    this.activeTaskAbortCallbacks.add(abort);
    try {
      await task();
    } finally {
      this.activeTaskAbortCallbacks.delete(abort);
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

  private resolveIdleWaiters = (): void => {
    if (this.activeTasks > 0 || this.queue.length > 0) return;

    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  };

  private removeQueuedItem = (item: TaskQueueItem): boolean => {
    const index = this.queue.indexOf(item);
    if (index === -1) return false;

    this.queue.splice(index, 1);
    return true;
  };
}

const createDeferred = <T>(): PromiseWithResolvers<T> => {
  if (Promise.withResolvers) {
    return Promise.withResolvers<T>();
  }

  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

const waitForProcessingOrDeadline = async (
  processing: Promise<void>,
  closeDeadline: number,
): Promise<boolean> => {
  let timeoutId: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      processing.then(() => true),
      new Promise<boolean>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), closeDeadline);
        timeoutId.unref();
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};
