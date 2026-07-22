import { DumboError } from '../errors';

export type Abort = {
  signal: AbortSignal;
};

export type AbortOptions = {
  abort?: Abort | undefined;
};

export type AbortScope = Abort & {
  abort: (reason?: unknown) => void;
  dispose: () => void;
};

const getSignal = (abort: Abort | AbortSignal): AbortSignal =>
  'signal' in abort ? abort.signal : abort;

const reason = (abort: Abort | AbortSignal): Error => {
  const signal = getSignal(abort);
  return signal.reason instanceof Error
    ? signal.reason
    : new DumboError(
        typeof signal.reason === 'string' ? signal.reason : 'Operation aborted',
      );
};

const scope = (
  parent?: Abort,
  onAbort?: (reason: Error) => void,
): AbortScope => {
  const controller = new AbortController();
  const dispose = onAbortSignal(parent, (reason) => {
    controller.abort(reason);
    onAbort?.(reason);
  });

  return {
    abort: (reason) => controller.abort(reason),
    dispose,
    signal: controller.signal,
  };
};

const execute = <Result>(
  operation: () => Promise<Result>,
  options?: AbortOptions,
): Promise<Result> => {
  const abort = options?.abort;
  if (!abort) return operation();

  const signal = abort.signal;
  if (signal.aborted) {
    return Promise.reject(reason(abort));
  }

  return new Promise<Result>((resolve, reject) => {
    let finished = false;
    const rejectOnAbort = () => {
      if (finished) return;
      finished = true;
      reject(reason(abort));
    };

    signal.addEventListener('abort', rejectOnAbort, { once: true });

    let operationPromise: Promise<Result>;
    try {
      operationPromise = operation();
    } catch (error) {
      finished = true;
      signal.removeEventListener('abort', rejectOnAbort);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(error);
      return;
    }

    operationPromise
      .then((result) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', rejectOnAbort);
        resolve(result);
      })
      .catch((error) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', rejectOnAbort);
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject(error);
      });
  });
};

const onAbortSignal = (
  abort: Abort | undefined,
  handle: (reason: Error) => void,
): (() => void) => {
  if (!abort) return () => {};

  const signal = abort.signal;
  if (signal.aborted) {
    handle(reason(abort));
    return () => {};
  }

  const abortListener = () => handle(reason(abort));
  signal.addEventListener('abort', abortListener, { once: true });
  return () => signal.removeEventListener('abort', abortListener);
};

export const Abort = {
  execute,
  onAbort: onAbortSignal,
  reason,
  scope,
} as const;
