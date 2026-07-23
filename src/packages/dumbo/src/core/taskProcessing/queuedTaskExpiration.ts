import type { TaskQueue, TaskQueueItem } from './taskProcessor';

export type QueuedTaskExpiration = ReturnType<typeof queuedTaskExpiration>;

export const queuedTaskExpiration = ({
  queue,
  maxTaskIdleTime,
  expire,
  onExpired,
}: {
  queue: TaskQueue;
  maxTaskIdleTime: number | undefined;
  expire: (item: TaskQueueItem, reason: Error) => void;
  onExpired: () => void;
}) => {
  let timer: NodeJS.Timeout | null = null;

  const deadlineForNewTask = (): number | undefined =>
    maxTaskIdleTime === undefined ? undefined : Date.now() + maxTaskIdleTime;

  const schedule = (): void => {
    if (timer !== null || maxTaskIdleTime === undefined) return;

    scheduleNext();
  };

  const rejectIfExpired = (item: TaskQueueItem): boolean => {
    if (item.expiresAt === undefined || item.expiresAt > Date.now()) {
      return false;
    }

    expire(item, createTaskIdleTimeoutError());
    onExpired();
    return true;
  };

  const cancel = (): void => {
    if (timer === null) return;

    clearTimeout(timer);
    timer = null;
  };

  const scheduleNext = (): void => {
    if (maxTaskIdleTime === undefined) return;

    const nextExpiresAt = queue.reduce<number | null>(
      (next, item) =>
        item.expiresAt !== undefined && (next === null || item.expiresAt < next)
          ? item.expiresAt
          : next,
      null,
    );

    if (nextExpiresAt === null) return;

    const timeoutMs = Math.max(0, nextExpiresAt - Date.now());
    timer = setTimeout(() => {
      timer = null;
      rejectExpiredQueuedTasks();
      scheduleNext();
    }, timeoutMs);
    timer.unref();
  };

  const rejectExpiredQueuedTasks = (): void => {
    const now = Date.now();
    let didRejectItem = false;

    for (let i = 0; i < queue.length; ) {
      const item = queue[i];
      if (item?.expiresAt === undefined || item.expiresAt > now) {
        i++;
        continue;
      }

      queue.splice(i, 1);
      didRejectItem = true;
      expire(item, createTaskIdleTimeoutError());
    }

    if (didRejectItem) {
      onExpired();
    }
  };

  return {
    cancel,
    deadlineForNewTask,
    rejectIfExpired,
    schedule,
  };
};

const createTaskIdleTimeoutError = (): Error =>
  new Error('Task was not started within the maximum waiting time');
