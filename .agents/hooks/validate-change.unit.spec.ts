import { describe, expect, it } from 'vitest';
import { shouldRunCheck } from './validate-change.ts';

describe('validate-change hook', () => {
  it('skips the check when the session did not edit files', () => {
    expect(shouldRunCheck({ session_id: 'session-1' }, false)).toBe(false);
  });

  it('runs the check when the session edited files', () => {
    expect(shouldRunCheck({ session_id: 'session-1' }, true)).toBe(true);
  });

  it('skips the check when the stop hook is already active', () => {
    expect(
      shouldRunCheck({ session_id: 'session-1', stop_hook_active: true }, true),
    ).toBe(false);
  });

  it('runs the check when the hook input has no session id', () => {
    expect(shouldRunCheck({}, false)).toBe(true);
  });
});
