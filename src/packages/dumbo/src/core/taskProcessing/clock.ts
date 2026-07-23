export const Clock = {
  now: (): number =>
    globalThis.Temporal?.Now.instant().epochMilliseconds ?? Date.now(),
} as const;
