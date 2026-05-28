import { v7 as uuid } from 'uuid';
import type { AbortOptions } from './abort';
import { ResourcePool } from './resourcePool';
import type { OperationContext } from './taskProcessor';
import { TaskProcessor } from './taskProcessor';

export type ExclusiveAccessGuard = {
  readonly stopped: boolean;
  execute: <Result>(
    operation: (ctx: OperationContext) => Promise<Result>,
    options?: AbortOptions,
  ) => Promise<Result>;
  waitForIdle: () => Promise<void>;
  stop: (options?: {
    force?: boolean;
    closeDeadline?: number;
  }) => Promise<void>;
};

const exclusiveAccess = (options?: {
  maxQueueSize?: number;
  signal?: AbortSignal | undefined;
  stoppedError?: (() => Error) | undefined;
}): ExclusiveAccessGuard => {
  const taskProcessor = new TaskProcessor({
    maxActiveTasks: 1,
    maxQueueSize: options?.maxQueueSize ?? 1000,
    signal: options?.signal,
    stoppedError: options?.stoppedError,
  });

  return {
    get stopped() {
      return taskProcessor.stopped;
    },
    execute: <Result>(
      operation: (ctx: OperationContext) => Promise<Result>,
      operationOptions?: AbortOptions,
    ): Promise<Result> =>
      taskProcessor.enqueue(async ({ ack, signal }) => {
        try {
          return await operation({ signal });
        } finally {
          ack();
        }
      }, operationOptions),
    waitForIdle: () => taskProcessor.waitForEndOfProcessing(),
    stop: (stopOptions) => taskProcessor.stop(stopOptions),
  };
};

export type BoundedAccessGuard<Resource> = {
  readonly stopped: boolean;
  acquire: () => Promise<Resource>;
  release: (resource: Resource) => void;
  execute: <Result>(
    operation: (resource: Resource, ctx: OperationContext) => Promise<Result>,
    options?: AbortOptions,
  ) => Promise<Result>;
  waitForIdle: () => Promise<void>;
  stop: (options?: {
    force?: boolean;
    closeDeadline?: number;
  }) => Promise<void>;
};

const boundedAccess = <Resource>(
  getResource: () => Resource | Promise<Resource>,
  options: {
    maxResources: number;
    maxQueueSize?: number;
    reuseResources?: boolean;
    closeResource?: (resource: Resource) => void | Promise<void>;
    signal?: AbortSignal | undefined;
    stoppedError?: (() => Error) | undefined;
  },
): BoundedAccessGuard<Resource> => {
  const taskProcessor = new TaskProcessor({
    maxActiveTasks: options.maxResources,
    maxQueueSize: options.maxQueueSize ?? 1000,
    signal: options.signal,
    stoppedError: options.stoppedError,
  });

  const resourcePool = ResourcePool.create<Resource>(getResource, {
    reuseResources: options.reuseResources,
    closeResource: options.closeResource,
  });

  const ackCallbacks = new Map<Resource, () => void>();

  const acquire = async (): Promise<Resource> =>
    taskProcessor.enqueue(async ({ ack }) => {
      try {
        const resource = await resourcePool.acquire();
        ackCallbacks.set(resource, ack);
        return resource;
      } catch (e) {
        ack();
        throw e;
      }
    });

  const release = (resource: Resource) => {
    const ack = ackCallbacks.get(resource);
    if (ack) {
      ackCallbacks.delete(resource);
      resourcePool.release(resource);
      ack();
    }
  };

  const execute = <Result>(
    operation: (resource: Resource, ctx: OperationContext) => Promise<Result>,
    operationOptions?: AbortOptions,
  ): Promise<Result> =>
    taskProcessor.enqueue(async ({ ack, signal }) => {
      let resource: Resource | undefined;
      try {
        resource = await resourcePool.acquire();
        return await operation(resource, { signal });
      } finally {
        if (resource) resourcePool.release(resource);
        ack();
      }
    }, operationOptions);

  return {
    get stopped() {
      return taskProcessor.stopped;
    },
    acquire,
    release,
    execute,
    waitForIdle: () => taskProcessor.waitForEndOfProcessing(),
    stop: async (stopOptions) => {
      if (taskProcessor.stopped) return;
      await taskProcessor.stop(stopOptions);
      await resourcePool.close();
    },
  };
};

export type InitializedOnceGuard<T> = {
  readonly stopped: boolean;
  ensureInitialized: () => Promise<T>;
  reset: () => void;
  stop: (options?: {
    force?: boolean;
    closeDeadline?: number;
  }) => Promise<void>;
};

const initializedOnce = <T>(
  initialize: () => Promise<T>,
  options?: {
    maxQueueSize?: number;
    maxRetries?: number;
    signal?: AbortSignal | undefined;
    stoppedError?: (() => Error) | undefined;
  },
): InitializedOnceGuard<T> => {
  let initPromise: Promise<T> | null = null;

  const taskProcessor = new TaskProcessor({
    maxActiveTasks: 1,
    maxQueueSize: options?.maxQueueSize ?? 1000,
    signal: options?.signal,
    stoppedError: options?.stoppedError,
  });

  const ensureInitialized = async (retryCount = 0): Promise<T> => {
    if (initPromise !== null) {
      return initPromise;
    }

    return taskProcessor.enqueue(
      async ({ ack }) => {
        if (initPromise !== null) {
          ack();
          return initPromise;
        }

        try {
          const promise = initialize();
          initPromise = promise;
          const result = await promise;
          ack();
          return result;
        } catch (error) {
          initPromise = null;
          ack();
          const maxRetries = options?.maxRetries ?? 3;
          if (retryCount < maxRetries) {
            return ensureInitialized(retryCount + 1);
          }
          throw error;
        }
      },
      { taskGroupId: uuid() },
    );
  };

  return {
    get stopped() {
      return taskProcessor.stopped;
    },
    ensureInitialized,
    reset: () => {
      initPromise = null;
    },
    stop: (stopOptions) => taskProcessor.stop(stopOptions),
  };
};

export const Guard = {
  exclusiveAccess,
  boundedAccess,
  initializedOnce,
} as const;
