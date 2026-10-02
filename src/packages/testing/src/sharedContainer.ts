type StoppableContainer = { stop: () => Promise<unknown> };

type SharedContainer = {
  container: Promise<StoppableContainer>;
  users: number;
};

/**
 * Vitest loads a global setup once per project, each copy with its own module
 * state, but runs all of them in the main process. Keeping the containers on
 * globalThis lets every project of a run share one container per database,
 * instead of starting them one after another before the first test.
 */
const containers = globalThis as unknown as Record<
  symbol,
  SharedContainer | undefined
>;

const keyFor = (name: string) => Symbol.for(`@event-driven-io/testing/${name}`);

export const acquireContainer = async <Container extends StoppableContainer>(
  name: string,
  start: () => Promise<Container>,
): Promise<Container> => {
  const shared = (containers[keyFor(name)] ??= {
    container: start(),
    users: 0,
  });
  shared.users++;

  return (await shared.container) as Container;
};

export const releaseContainer = async (name: string): Promise<void> => {
  const key = keyFor(name);
  const shared = containers[key];

  if (!shared || --shared.users > 0) return;

  containers[key] = undefined;
  await (await shared.container).stop();
};
