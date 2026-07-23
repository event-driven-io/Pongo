export const Clock = {
  now: (): number => {
    const anchor = getClockAnchor();
    return anchor.epochMilliseconds + (performance.now() - anchor.elapsedMs);
  },
  unrefTimer: (timer: TimerHandle): void => {
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      const nodeTimer = timer as { unref?: () => void };
      if (typeof nodeTimer.unref === 'function') {
        nodeTimer.unref();
      }
    }
  },
} as const;

export type TimerHandle = ReturnType<typeof setTimeout>;

type ClockAnchor = {
  epochMilliseconds: number;
  elapsedMs: number;
  performance: Performance;
  temporal: typeof Temporal | undefined;
};

let clockAnchor: ClockAnchor | null = null;

const getClockAnchor = (): ClockAnchor => {
  if (
    clockAnchor &&
    clockAnchor.performance === performance &&
    clockAnchor.temporal === globalThis.Temporal
  ) {
    return clockAnchor;
  }

  clockAnchor = globalThis.Temporal
    ? {
        elapsedMs: performance.now(),
        epochMilliseconds: globalThis.Temporal.Now.instant().epochMilliseconds,
        performance,
        temporal: globalThis.Temporal,
      }
    : {
        elapsedMs: 0,
        epochMilliseconds: performance.timeOrigin,
        performance,
        temporal: undefined,
      };

  return clockAnchor;
};
