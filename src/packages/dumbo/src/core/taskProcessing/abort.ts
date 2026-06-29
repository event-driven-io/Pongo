import { DumboError, TransientDatabaseError } from '../errors';

export type AbortOptions = {
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
};

const link = (...signals: (AbortSignal | undefined | null)[]): AbortSignal => {
  const real = signals.filter((p): p is AbortSignal => p != null);
  if (real.length === 0) return new AbortController().signal;
  if (real.length === 1) return real[0]!;
  return AbortSignal.any(real);
};

const source = (
  ...parents: (AbortSignal | undefined | null)[]
): AbortController => {
  const controller = new AbortController();
  for (const parent of parents) {
    if (!parent) continue;
    if (parent.aborted) {
      controller.abort(parent.reason);
      return controller;
    }
    parent.addEventListener('abort', () => controller.abort(parent.reason), {
      once: true,
    });
  }
  return controller;
};

const after = (
  timeoutMs: number,
  ...parents: (AbortSignal | undefined | null)[]
): AbortSignal => {
  const controller = source(...parents);
  if (controller.signal.aborted) return controller.signal;
  const timer = setTimeout(
    () =>
      controller.abort(
        new TransientDatabaseError(`Operation timed out after ${timeoutMs}ms`),
      ),
    timeoutMs,
  );
  timer.unref();
  controller.signal.addEventListener('abort', () => clearTimeout(timer), {
    once: true,
  });
  return controller.signal;
};

const reason = (signal: AbortSignal): Error => {
  const value: unknown = signal.reason;
  if (value instanceof Error) return value;
  return new DumboError(
    typeof value === 'string' ? value : 'Operation aborted',
  );
};

export const Abort = {
  link,
  source,
  after,
  reason,
} as const;
