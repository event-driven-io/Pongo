export type OperationCancellationOptions = {
  cancellation?: { signal: AbortSignal } | undefined;
};

export const executeWithCancellation = <Result>(
  operation: () => Promise<Result>,
  options?: OperationCancellationOptions,
): Promise<Result> => {
  const signal = options?.cancellation?.signal;
  if (!signal) return operation();

  const abortReason = () =>
    signal.reason instanceof Error
      ? signal.reason
      : new Error(String(signal.reason));

  if (signal.aborted) {
    return Promise.reject(abortReason());
  }

  return new Promise<Result>((resolve, reject) => {
    let finished = false;
    const abort = () => {
      if (finished) return;
      finished = true;
      reject(abortReason());
    };

    signal.addEventListener('abort', abort, { once: true });
    operation()
      .then((result) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', abort);
        resolve(result);
      })
      .catch((error) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', abort);
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        reject(error);
      });
  });
};
