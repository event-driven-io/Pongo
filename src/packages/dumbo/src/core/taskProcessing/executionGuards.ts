import { v7 as uuid } from 'uuid';
import { TaskProcessor } from './taskProcessor';

export type ExclusiveAccessGuard = {
  execute: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  waitForIdle: () => Promise<void>;
  stop: (options?: { force?: boolean }) => Promise<void>;
};

export const guardExclusiveAccess = (options?: {
  maxQueueSize?: number;
}): ExclusiveAccessGuard => {
  const taskProcessor = new TaskProcessor({
    maxActiveTasks: 1,
    maxQueueSize: options?.maxQueueSize ?? 1000,
  });

  return {
    execute: <Result>(operation: () => Promise<Result>): Promise<Result> =>
      taskProcessor.enqueue(async ({ ack }) => {
        try {
          return await operation();
        } finally {
          ack();
        }
      }),
    waitForIdle: () => taskProcessor.waitForEndOfProcessing(),
    stop: (options) => taskProcessor.stop(options),
  };
};

export type BoundedAccessGuard<Resource> = {
  acquire: () => Promise<Resource>;
  release: (resource: Resource) => void;
  execute: <Result>(
    operation: (resource: Resource) => Promise<Result>,
  ) => Promise<Result>;
  waitForIdle: () => Promise<void>;
  stop: (options?: { force?: boolean }) => Promise<void>;
};

export const guardBoundedAccess = <Resource>(
  getResource: () => Resource | Promise<Resource>,
  options: {
    maxResources: number;
    maxQueueSize?: number;
    reuseResources?: boolean;
    closeResource?: (resource: Resource) => void | Promise<void>;
  },
): BoundedAccessGuard<Resource> => {
  let isStopped = false;
  const taskProcessor = new TaskProcessor({
    maxActiveTasks: options.maxResources,
    maxQueueSize: options.maxQueueSize ?? 1000,
  });

  const resourcePool: Resource[] = [];
  const allResources = new Set<Resource>();
  const ackCallbacks = new Map<Resource, () => void>();

  const acquire = async (): Promise<Resource> =>
    taskProcessor.enqueue(async ({ ack }) => {
      try {
        let resource: Resource | undefined;

        if (options.reuseResources) {
          resource = resourcePool.pop();
        }

        if (!resource) {
          resource = await getResource();
          allResources.add(resource);
        }

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
      if (options.reuseResources) {
        resourcePool.push(resource);
      }
      ack();
    }
  };

  const execute = async <Result>(
    operation: (resource: Resource) => Promise<Result>,
  ): Promise<Result> => {
    const resource = await acquire();
    try {
      return await operation(resource);
    } finally {
      release(resource);
    }
  };

  return {
    acquire,
    release,
    execute,
    waitForIdle: () => taskProcessor.waitForEndOfProcessing(),
    stop: async (stopOptions) => {
      if (isStopped) return;
      isStopped = true;
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

      await taskProcessor.stop(stopOptions);
    },
  };
};

export type InitializedOnceGuard<T> = {
  ensureInitialized: () => Promise<T>;
  reset: () => void;
  stop: (options?: { force?: boolean }) => Promise<void>;
};

export const guardInitializedOnce = <T>(
  initialize: () => Promise<T>,
  options?: {
    maxQueueSize?: number;
    maxRetries?: number;
  },
): InitializedOnceGuard<T> => {
  let initPromise: Promise<T> | null = null;

  const taskProcessor = new TaskProcessor({
    maxActiveTasks: 1,
    maxQueueSize: options?.maxQueueSize ?? 1000,
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
    ensureInitialized,
    reset: () => {
      initPromise = null;
    },
    stop: (options) => taskProcessor.stop(options),
  };
};
