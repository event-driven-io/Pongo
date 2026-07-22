import { DumboError, TransientDatabaseError } from '../errors';
import type { OperationCancellationOptions } from '../cancellation';

export type TaskQueue = TaskQueueItem[];

export type TaskQueueItem = {
  task: () => Promise<void>;
  options?: EnqueueTaskOptions | undefined;
  reject: (reason?: unknown) => void;
  markStarted: () => void;
  abort: (reason?: unknown) => void;
};

export type TaskProcessorOptions = {
  maxActiveTasks: number;
  maxQueueSize: number;
  maxTaskIdleTime?: number;
};

export type Task<T> = (context: TaskContext) => Promise<T>;

export type OperationContext = {
  signal: AbortSignal;
};

export type TaskContext = OperationContext & {
  ack: () => void;
};

export type EnqueueTaskOptions = { taskGroupId?: string };
export type TaskOperationOptions = EnqueueTaskOptions &
  OperationCancellationOptions;

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

  constructor(options: TaskProcessorOptions) {
    this.options = options;
  }

  enqueue<T>(task: Task<T>, options?: TaskOperationOptions): Promise<T> {
    if (options?.cancellation?.signal.aborted) {
      return Promise.reject(abortReason(options.cancellation.signal));
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
    return new Promise<T>((resolve, reject) => {
      let didQueueTimeout = false;
      const abortController = new AbortController();
      let queueWaitTimer: QueueWaitTimer = noopQueueWaitTimer;
      const unlinkCancellationSignal = linkCancellationSignal(
        options?.cancellation?.signal,
        (reason) => {
          queueWaitTimer.cancel();
          abortController.abort(reason);
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(reason);
        },
      );
      queueWaitTimer = createQueueWaitTimer(
        this.options.maxTaskIdleTime,
        (reason) => {
          didQueueTimeout = true;
          abortController.abort(reason);
          unlinkCancellationSignal();
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
            signal: abortController.signal,
          });

          taskPromise
            .then((result) => {
              unlinkCancellationSignal();
              resolve(result);
            })
            .catch((err) => {
              unlinkCancellationSignal();
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
          unlinkCancellationSignal();
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          reject(reason);
        },
        markStarted: () => {
          queueWaitTimer.cancel();
        },
        abort: (reason) => {
          unlinkCancellationSignal();
          abortController.abort(reason);
        },
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
    abort,
  }: TaskQueueItem): Promise<void> {
    markStarted();
    this.activeTaskAbortCallbacks.add(abort);
    try {
      await task();
    } catch {
      // The enqueue promise is rejected by taskWithContext.
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

const noopQueueWaitTimer: QueueWaitTimer = { cancel: () => {} };

const createQueueWaitTimer = (
  timeoutMs: number | undefined,
  reject: (reason: unknown) => void,
): QueueWaitTimer => {
  if (timeoutMs === undefined) return noopQueueWaitTimer;

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

const linkCancellationSignal = (
  signal: AbortSignal | undefined,
  abort: (reason: unknown) => void,
): (() => void) => {
  if (!signal) return () => {};

  if (signal.aborted) {
    abort(abortReason(signal));
    return () => {};
  }

  const onAbort = () => abort(abortReason(signal));
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
};

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new Error(String(signal.reason));

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
