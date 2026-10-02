import assert from 'assert';
import { randomUUID } from 'crypto';
import { describe, it } from 'vitest';
import { acquireContainer, releaseContainer } from './sharedContainer';

const fakeContainer = () => {
  const calls = { starts: 0, stops: 0 };
  const start = () => {
    calls.starts++;
    return Promise.resolve({
      stop: () => {
        calls.stops++;
        return Promise.resolve();
      },
    });
  };
  return { calls, start };
};

describe('shared container', () => {
  it('starts the container once for all projects that acquire it', async () => {
    const name = randomUUID();
    const { calls, start } = fakeContainer();

    const first = await acquireContainer(name, start);
    const second = await acquireContainer(name, start);

    assert.strictEqual(first, second);
    assert.strictEqual(calls.starts, 1);

    await releaseContainer(name);
    await releaseContainer(name);
  });

  it('stops the container only when the last project releases it', async () => {
    const name = randomUUID();
    const { calls, start } = fakeContainer();
    await acquireContainer(name, start);
    await acquireContainer(name, start);

    await releaseContainer(name);
    assert.strictEqual(calls.stops, 0);

    await releaseContainer(name);
    assert.strictEqual(calls.stops, 1);
  });

  it('starts a new container when acquired after the last release', async () => {
    const name = randomUUID();
    const { calls, start } = fakeContainer();
    await acquireContainer(name, start);
    await releaseContainer(name);

    await acquireContainer(name, start);
    await releaseContainer(name);

    assert.strictEqual(calls.starts, 2);
    assert.strictEqual(calls.stops, 2);
  });
});
