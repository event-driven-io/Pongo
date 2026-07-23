import { DumboError, TransientDatabaseError } from '../errors';
import { Abort } from './abort';
import type { AbortOptions } from './abort';
import { Clock, type TimerHandle } from './clock';
import { taskScheduler } from './taskScheduler';

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

export type TaskProcessor = ReturnType<typeof taskProcessor>;

export const taskProcessor = (processorOptions: TaskProcessorOptions) => {
  let isProcessing = false;
  let activeTasks = 0;
  let stopped = false;
  const idleWaiters: Array<() => void> = [];
  const activeTaskAbortCallbacks: Set<(reason?: unknown) => void> = new Set();
  const logger = processorOptions.logger ?? console;
  const queuedTasks = taskScheduler();
  let expirationTimer: TimerHandle | null = null;

  const enqueue = <T>(
    task: Task<T>,
    options?: TaskOperationOptions,
  ): Promise<T> => {
    if (options?.abort?.signal.aborted) {
      return Promise.reject(Abort.reason(options.abort.signal));
    }

    if (stopped) {
      return Promise.reject(new DumboError('TaskProcessor has been stopped'));
    }

    if (queuedTasks.size() >= processorOptions.maxQueueSize) {
      return Promise.reject(
        new TransientDatabaseError(
          'Too many pending connections. Please try again later.',
        ),
      );
    }

    return schedule(task, options);
  };

  const waitForEndOfProcessing = (): Promise<void> => {
    if (activeTasks === 0 && queuedTasks.size() === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      idleWaiters.push(resolve);
    });
  };

  const stop = async (options?: StopTaskProcessorOptions): Promise<void> => {
    if (stopped) return;
    stopped = true;
    const stoppedError = new DumboError('TaskProcessor has been stopped');
    for (const item of queuedTasks.clear()) {
      item.abort(stoppedError);
      item.reject(stoppedError);
    }
    cancelExpirationTimer();

    if (options?.force) {
      for (const abort of activeTaskAbortCallbacks) {
        abort(stoppedError);
      }
    }

    if (options?.force) return;

    if (options?.closeDeadline === undefined) {
      await waitForEndOfProcessing();
      return;
    }

    const didDrain = await waitForProcessingOrDeadline(
      waitForEndOfProcessing(),
      options.closeDeadline,
    );

    if (!didDrain) {
      for (const abort of activeTaskAbortCallbacks) {
        abort(stoppedError);
      }
    }
  };

  const schedule = <T>(
    task: Task<T>,
    options?: TaskOperationOptions,
  ): Promise<T> => {
    const { promise, resolve, reject } = createDeferred<T>();
    let didAbortBeforeStart = false;
    let didStart = false;
    let queuedItem: TaskQueueItem | null = null;

    const abortScope = Abort.scope(options?.abort, (reason) => {
      didAbortBeforeStart = !didStart;
      if (didAbortBeforeStart && queuedItem) {
        removeQueuedItem(queuedItem);
        abortScope.dispose();
        resolveIdleWaiters();
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
    const expiresAtMs = deadlineForNewTask();

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
    queuedTasks.enqueue(queuedItem);
    scheduleExpiration();
    if (!isProcessing) {
      ensureProcessing();
    }

    return promise;
  };

  const ensureProcessing = (): void => {
    if (isProcessing) return;
    isProcessing = true;
    processQueue();
  };

  const processQueue = (): void => {
    try {
      rejectExpiredQueuedTasks();
      while (
        activeTasks < processorOptions.maxActiveTasks &&
        queuedTasks.size() > 0
      ) {
        const item = queuedTasks.takeNext();

        if (item === null) return;

        activeTasks++;
        void executeItem(item).catch((err) => {
          logger.error('TaskProcessor caught unhandled task rejection:', err);
        });
      }
    } catch (error) {
      logger.error(error);
      throw error;
    } finally {
      isProcessing = false;
    }
  };

  const executeItem = async (item: TaskQueueItem): Promise<void> => {
    const { task, markStarted, abort } = item;
    markStarted();
    activeTaskAbortCallbacks.add(abort);
    try {
      await task();
    } finally {
      activeTaskAbortCallbacks.delete(abort);
      activeTasks--;

      queuedTasks.complete(item);

      resolveIdleWaiters();
      ensureProcessing();
    }
  };

  const resolveIdleWaiters = (): void => {
    if (activeTasks > 0 || queuedTasks.size() > 0) return;

    const waiters = idleWaiters.splice(0);
    for (const resolve of waiters) {
      resolve();
    }
  };

  const removeQueuedItem = (item: TaskQueueItem): boolean => {
    return queuedTasks.remove(item);
  };

  const deadlineForNewTask = (): number | undefined =>
    processorOptions.maxTaskIdleTime === undefined
      ? undefined
      : Clock.now() + processorOptions.maxTaskIdleTime;

  const scheduleExpiration = (): void => {
    if (expirationTimer !== null) return;

    const nextExpirationMs = queuedTasks.nextExpirationMs();
    if (nextExpirationMs === null) return;

    expirationTimer = setTimeout(
      () => {
        expirationTimer = null;
        rejectExpiredQueuedTasks();
        scheduleExpiration();
      },
      Math.max(0, nextExpirationMs - Clock.now()),
    );
    Clock.unrefTimer(expirationTimer);
  };

  const cancelExpirationTimer = (): void => {
    if (expirationTimer === null) return;

    clearTimeout(expirationTimer);
    expirationTimer = null;
  };

  const rejectExpiredQueuedTasks = (): void => {
    const expiredItems = queuedTasks.expire(Clock.now());
    if (expiredItems.length === 0) return;

    for (const item of expiredItems) {
      const reason = createTaskIdleTimeoutError();
      item.abort(reason);
      item.reject(reason);
    }

    resolveIdleWaiters();
  };

  return {
    enqueue,
    stop,
    waitForEndOfProcessing,
  };
};

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
  let timeoutId: TimerHandle | null = null;
  try {
    return await Promise.race([
      processing.then(() => true),
      new Promise<boolean>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), closeDeadline);
        Clock.unrefTimer(timeoutId);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const createTaskIdleTimeoutError = (): Error =>
  new Error('Task was not started within the maximum waiting time');
