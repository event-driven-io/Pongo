import assert from 'node:assert';
import { describe, it } from 'vitest';
import { TransientDatabaseError } from '../errors';
import { Abort } from './abort';

describe('Abort.link', () => {
  it('returns a never-aborting signal when no parents provided', () => {
    const signal = Abort.link();
    assert.strictEqual(signal.aborted, false);
  });

  it('returns the parent verbatim when only one is provided', () => {
    const controller = new AbortController();
    const signal = Abort.link(controller.signal);
    assert.strictEqual(signal, controller.signal);
  });

  it('ignores undefined and null parents', () => {
    const controller = new AbortController();
    const signal = Abort.link(undefined, controller.signal, null);
    assert.strictEqual(signal, controller.signal);
  });

  it('aborts when any parent aborts', () => {
    const a = new AbortController();
    const b = new AbortController();
    const signal = Abort.link(a.signal, b.signal);

    assert.strictEqual(signal.aborted, false);
    a.abort(new Error('a fired'));
    assert.strictEqual(signal.aborted, true);
  });

  it('returns an already-aborted signal if any parent is already aborted', () => {
    const a = new AbortController();
    a.abort(new Error('pre-aborted'));
    const b = new AbortController();
    const signal = Abort.link(a.signal, b.signal);
    assert.strictEqual(signal.aborted, true);
  });
});

describe('Abort.source', () => {
  it('returns a native AbortController', () => {
    const controller = Abort.source();
    assert.ok(controller instanceof AbortController);
  });

  it('signal fires when the controller is aborted manually', () => {
    const controller = Abort.source();
    const reason = new Error('manual');
    controller.abort(reason);
    assert.strictEqual(controller.signal.aborted, true);
    assert.strictEqual(controller.signal.reason, reason);
  });

  it('signal fires when any parent aborts', () => {
    const a = new AbortController();
    const controller = Abort.source(a.signal);
    assert.strictEqual(controller.signal.aborted, false);
    a.abort(new Error('parent'));
    assert.strictEqual(controller.signal.aborted, true);
  });

  it('signal is pre-aborted when any parent is already aborted', () => {
    const a = new AbortController();
    a.abort(new Error('pre'));
    const controller = Abort.source(a.signal);
    assert.strictEqual(controller.signal.aborted, true);
  });
});

describe('Abort.after', () => {
  it('aborts when the timeout elapses', async () => {
    const signal = Abort.after(10);
    await new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      signal.addEventListener('abort', () => resolve(), { once: true });
    });
    assert.strictEqual(signal.aborted, true);
    assert.ok(signal.reason instanceof TransientDatabaseError);
  });

  it('aborts with the parent reason when a parent fires before the timeout', () => {
    const controller = new AbortController();
    const parentReason = new Error('parent fired');
    const signal = Abort.after(60_000, controller.signal);

    assert.strictEqual(signal.aborted, false);
    controller.abort(parentReason);
    assert.strictEqual(signal.aborted, true);
    assert.strictEqual(signal.reason, parentReason);
  });

  it('does not change the reason after the timeout window when already aborted by a parent', async () => {
    const controller = new AbortController();
    const parentReason = new Error('parent fired');
    const signal = Abort.after(20, controller.signal);
    controller.abort(parentReason);

    const reasonBefore: unknown = signal.reason;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.strictEqual(signal.reason, reasonBefore);
  });
});

describe('Abort.reason', () => {
  it('returns the signal reason verbatim when it is an Error', () => {
    const controller = new AbortController();
    const reason = new Error('boom');
    controller.abort(reason);
    assert.strictEqual(Abort.reason(controller.signal), reason);
  });

  it('wraps non-Error string reasons in a DumboError', () => {
    const controller = new AbortController();
    controller.abort('something');
    const result = Abort.reason(controller.signal);
    assert.ok(result instanceof Error);
    assert.strictEqual(result.message, 'something');
  });

  it('falls back to a generic DumboError when the reason is not stringable', () => {
    const controller = new AbortController();
    controller.abort({ unusual: 'value' });
    const result = Abort.reason(controller.signal);
    assert.ok(result instanceof Error);
    assert.strictEqual(result.message, 'Operation aborted');
  });
});
