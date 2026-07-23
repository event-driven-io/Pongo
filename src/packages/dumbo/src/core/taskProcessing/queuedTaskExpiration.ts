import type { TaskQueue, TaskQueueItem } from './taskProcessor';
import { Clock } from './clock';

export type QueuedTaskExpiration = ReturnType<typeof queuedTaskExpiration>;

export const queuedTaskExpiration = ({
  queue,
  maxTaskIdleTime,
  expire,
  onExpired,
  now = Clock.now,
}: {
  queue: TaskQueue;
  maxTaskIdleTime: number | undefined;
  expire: (item: TaskQueueItem, reason: Error) => void;
  onExpired: () => void;
  now?: () => number;
}) => {
  let timer: NodeJS.Timeout | null = null;

  const deadlineForNewTask = (): number | undefined =>
    maxTaskIdleTime === undefined ? undefined : now() + maxTaskIdleTime;

  const schedule = (): void => {
    if (timer !== null || maxTaskIdleTime === undefined) return;

    scheduleEarliestExpiration();
  };

  const rejectIfExpired = (item: TaskQueueItem): boolean => {
    if (item.expiresAt === undefined || item.expiresAt > now()) {
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

  const scheduleEarliestExpiration = (): void => {
    if (maxTaskIdleTime === undefined) return;

    const nextExpiresAt = queue.reduce<number | null>(
      (next, item) =>
        item.expiresAt !== undefined && (next === null || item.expiresAt < next)
          ? item.expiresAt
          : next,
      null,
    );

    if (nextExpiresAt === null) return;

    const timeoutMs = Math.max(0, nextExpiresAt - now());
    timer = setTimeout(() => {
      timer = null;
      rejectExpiredQueuedTasks();
      scheduleEarliestExpiration();
    }, timeoutMs);
    timer.unref();
  };

  const rejectExpiredQueuedTasks = (): void => {
    const currentTime = now();
    let didRejectItem = false;

    for (let i = 0; i < queue.length;) {
      const item = queue[i];
      if (item?.expiresAt === undefined || item.expiresAt > currentTime) {
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
