import { v7 as uuid } from 'uuid';
import type { AbortContext, AbortOptions } from './abort';
import {
  taskProcessor,
  type TaskProcessorLogger,
  type StopTaskProcessorOptions,
  type TaskContext,
  type TaskOperationOptions,
} from './taskProcessor';

export type ExclusiveAccessGuard = {
  execute: <Result>(
    operation: (context: TaskContext) => Promise<Result>,
    options?: AbortOptions,
  ) => Promise<Result>;
  waitForEndOfProcessing: () => Promise<void>;
  stop: (options?: StopTaskProcessorOptions) => Promise<void>;
};

export const guardExclusiveAccess = (options?: {
  logger?: TaskProcessorLogger;
  maxQueueSize?: number;
  maxTaskIdleTime?: number;
}): ExclusiveAccessGuard => {
  const processor = taskProcessor({
    maxActiveTasks: 1,
    maxQueueSize: options?.maxQueueSize ?? 1000,
    ...(options?.logger !== undefined ? { logger: options.logger } : {}),
    ...(options?.maxTaskIdleTime !== undefined
      ? { maxTaskIdleTime: options.maxTaskIdleTime }
      : {}),
  });

  return {
    execute: <Result>(
      operation: (context: TaskContext) => Promise<Result>,
      options?: AbortOptions,
    ): Promise<Result> =>
      processor.enqueue((context) => operation(context), options),
    waitForEndOfProcessing: () => processor.waitForEndOfProcessing(),
    stop: (options) => processor.stop(options),
  };
};

export type ConcurrentAccessGuard = {
  execute: <Result>(
    operation: (context: AbortContext) => Promise<Result>,
    options?: AbortOptions,
  ) => Promise<Result>;
  waitForEndOfProcessing: () => Promise<void>;
  stop: (options?: StopTaskProcessorOptions) => Promise<void>;
};

export const guardConcurrentAccess = (options?: {
  logger?: TaskProcessorLogger;
  maxActiveTasks?: number;
  maxQueueSize?: number;
  maxTaskIdleTime?: number;
}): ConcurrentAccessGuard => {
  const processor = taskProcessor({
    maxActiveTasks: options?.maxActiveTasks ?? Number.MAX_SAFE_INTEGER,
    maxQueueSize: options?.maxQueueSize ?? Number.MAX_SAFE_INTEGER,
    ...(options?.logger !== undefined ? { logger: options.logger } : {}),
    ...(options?.maxTaskIdleTime !== undefined
      ? { maxTaskIdleTime: options.maxTaskIdleTime }
      : {}),
  });

  return {
    execute: <Result>(
      operation: (context: AbortContext) => Promise<Result>,
      options?: AbortOptions,
    ): Promise<Result> =>
      processor.enqueue(
        (context) => operation({ abort: context.abort }),
        options,
      ),
    waitForEndOfProcessing: () => processor.waitForEndOfProcessing(),
    stop: (options) => processor.stop(options),
  };
};

export type BoundedAccessGuard<Resource> = {
  acquire: (options?: TaskOperationOptions) => Promise<Resource>;
  release: (resource: Resource) => void;
  execute: <Result>(
    operation: (resource: Resource, context: AbortContext) => Promise<Result>,
    options?: AbortOptions,
  ) => Promise<Result>;
  waitForEndOfProcessing: () => Promise<void>;
  stop: (options?: StopTaskProcessorOptions) => Promise<void>;
};

export const guardBoundedAccess = <Resource>(
  getResource: (context: AbortContext) => Resource | Promise<Resource>,
  options: {
    logger?: TaskProcessorLogger;
    maxResources: number;
    maxQueueSize?: number;
    reuseResources?: boolean;
    closeResource?: (resource: Resource) => void | Promise<void>;
  },
): BoundedAccessGuard<Resource> => {
  let isStopped = false;
  const processor = taskProcessor({
    maxActiveTasks: options.maxResources,
    maxQueueSize: options.maxQueueSize ?? 1000,
    ...(options.logger !== undefined ? { logger: options.logger } : {}),
  });

  const resourcePool: Resource[] = [];
  const allResources = new Set<Resource>();
  const activeResourceContexts = new Map<
    Resource,
    { release: () => void; taskContext: TaskContext }
  >();

  const acquireResource = async (
    taskContext: TaskContext,
  ): Promise<Resource> => {
    try {
      let resource: Resource | undefined;

      if (options.reuseResources) {
        resource = resourcePool.pop();
      }

      if (!resource) {
        resource = await getResource({ abort: taskContext.abort });
        allResources.add(resource);
      }

      activeResourceContexts.set(resource, {
        release: taskContext.release,
        taskContext,
      });
      return resource;
    } catch (e) {
      taskContext.release();
      throw e;
    }
  };

  const acquire = async (
    operationOptions?: TaskOperationOptions,
  ): Promise<Resource> =>
    processor.enqueue((taskContext) => acquireResource(taskContext), {
      ...operationOptions,
      releaseMode: 'manual',
    });

  const getActiveResourceContext = (resource: Resource) => {
    const activeResourceContext = activeResourceContexts.get(resource);
    if (!activeResourceContext) {
      throw new Error('Acquired resource is not active');
    }

    return activeResourceContext;
  };

  const release = (resource: Resource) => {
    const activeResourceContext = activeResourceContexts.get(resource);
    if (activeResourceContext) {
      activeResourceContexts.delete(resource);
      if (options.reuseResources) {
        resourcePool.push(resource);
      }
      activeResourceContext.release();
    }
  };

  const execute = async <Result>(
    operation: (resource: Resource, context: AbortContext) => Promise<Result>,
    operationOptions?: AbortOptions,
  ): Promise<Result> => {
    return processor.enqueue(async (taskContext) => {
      const resource = await acquireResource(taskContext);
      const activeResourceContext = getActiveResourceContext(resource);
      try {
        return await operation(resource, {
          abort: activeResourceContext.taskContext.abort,
        });
      } finally {
        release(resource);
      }
    }, operationOptions);
  };

  return {
    acquire,
    release,
    execute,
    waitForEndOfProcessing: () => processor.waitForEndOfProcessing(),
    stop: async (stopOptions) => {
      if (isStopped) return;
      isStopped = true;
      await processor.stop(stopOptions);

      if (options?.closeResource) {
        const resources = [...allResources];
        allResources.clear();
        resourcePool.length = 0;
        await Promise.all(
          resources.map(
            async (resource) => await options.closeResource!(resource),
          ),
        );
      }
    },
  };
};

export type InitializedOnceGuard<T> = {
  ensureInitialized: (options?: AbortOptions) => Promise<T>;
  reset: () => void;
  stop: (options?: StopTaskProcessorOptions) => Promise<void>;
};

export const guardInitializedOnce = <T>(
  initialize: (context: AbortContext) => Promise<T>,
  options?: {
    logger?: TaskProcessorLogger;
    maxQueueSize?: number;
    maxRetries?: number;
  },
): InitializedOnceGuard<T> => {
  let initPromise: Promise<T> | null = null;

  const processor = taskProcessor({
    maxActiveTasks: 1,
    maxQueueSize: options?.maxQueueSize ?? 1000,
    ...(options?.logger !== undefined ? { logger: options.logger } : {}),
  });

  const ensureInitialized = async (
    operationOptions?: AbortOptions,
    retryCount = 0,
  ): Promise<T> => {
    if (initPromise !== null) {
      return initPromise;
    }

    return processor.enqueue(
      async ({ abort, release }) => {
        if (initPromise !== null) {
          release();
          return initPromise;
        }

        try {
          const promise = initialize({ abort });
          initPromise = promise;
          const result = await promise;
          return result;
        } catch (error) {
          initPromise = null;
          const maxRetries = options?.maxRetries ?? 3;
          if (retryCount < maxRetries) {
            release();
            return ensureInitialized(operationOptions, retryCount + 1);
          }
          throw error;
        }
      },
      { ...operationOptions, taskGroupId: uuid() },
    );
  };

  return {
    ensureInitialized,
    reset: () => {
      initPromise = null;
    },
    stop: (options) => processor.stop(options),
  };
};
