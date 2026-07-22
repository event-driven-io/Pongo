import assert from 'node:assert';
import { describe, it } from 'vitest';
import { DumboError } from '../errors';
import { Abort } from './abort';

describe('Abort', () => {
  it('uses the original Error when an operation is aborted with one', () => {
    const abortController = new AbortController();
    const reason = new Error('aborted');

    abortController.abort(reason);

    assert.strictEqual(Abort.reason(abortController.signal), reason);
  });

  it('provides a DumboError when an operation is aborted with a string reason', () => {
    const abortController = new AbortController();

    abortController.abort('aborted');

    const reason = Abort.reason(abortController.signal);
    assert.ok(reason instanceof DumboError);
    assert.strictEqual(reason.message, 'aborted');
  });

  it('provides an Error when an operation is aborted without an explicit reason', () => {
    const abortController = new AbortController();

    abortController.abort();

    assert.ok(Abort.reason(abortController.signal) instanceof Error);
  });

  it('does not leave abort handling attached when operation setup fails synchronously', async () => {
    const abortController = new AbortController();

    await assert.rejects(
      () =>
        Abort.execute(
          () => {
            throw new Error('sync failure');
          },
          { abort: { signal: abortController.signal } },
        ),
      /sync failure/,
    );
  });

  it('does not start an operation when abort is already requested', async () => {
    const abortController = new AbortController();
    abortController.abort(new Error('already aborted'));
    let executed = false;

    await assert.rejects(
      () =>
        Abort.execute(
          () => {
            executed = true;
            return Promise.resolve(1);
          },
          { abort: { signal: abortController.signal } },
        ),
      /already aborted/,
    );
    assert.strictEqual(executed, false);
  });

  it('rejects an operation when abort is requested while it is running', async () => {
    const abortController = new AbortController();
    const started = Promise.withResolvers<void>();

    const operation = Abort.execute(
      async () => {
        started.resolve();
        await new Promise(() => {});
      },
      { abort: { signal: abortController.signal } },
    );

    await started.promise;
    abortController.abort(new Error('aborted later'));

    await assert.rejects(operation, /aborted later/);
  });

  it('creates an operation scope that follows the parent abort request', () => {
    const parent = new AbortController();
    const scope = Abort.scope({ signal: parent.signal });

    parent.abort(new Error('parent aborted'));

    assert.strictEqual(scope.signal.aborted, true);
    assert.strictEqual(Abort.reason(scope.signal).message, 'parent aborted');
  });

  it('detaches an operation scope when it is no longer active', () => {
    const parent = new AbortController();
    const scope = Abort.scope({ signal: parent.signal });

    scope.dispose();
    parent.abort(new Error('parent aborted'));

    assert.strictEqual(scope.signal.aborted, false);
  });
});
