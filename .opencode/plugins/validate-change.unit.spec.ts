import { describe, expect, it } from 'vitest';
import { idleSessionID, isFileEditingTool } from './validate-change.ts';

describe('validate-change plugin', () => {
  it.each(['edit', 'write', 'apply_patch'])(
    'treats the %s tool as a file edit',
    (tool) => {
      expect(isFileEditingTool(tool)).toBe(true);
    },
  );

  it.each(['read', 'bash', 'grep', 'glob', 'webfetch'])(
    'does not treat the %s tool as a file edit',
    (tool) => {
      expect(isFileEditingTool(tool)).toBe(false);
    },
  );

  it('returns the session id when the session becomes idle', () => {
    expect(
      idleSessionID({
        type: 'session.status',
        properties: { sessionID: 'session-1', status: { type: 'idle' } },
      }),
    ).toBe('session-1');
  });

  it('does not return a session id when the session becomes busy', () => {
    expect(
      idleSessionID({
        type: 'session.status',
        properties: { sessionID: 'session-1', status: { type: 'busy' } },
      }),
    ).toBeUndefined();
  });

  it('does not return a session id for the deprecated session.idle event', () => {
    expect(
      idleSessionID({
        type: 'session.idle',
        properties: { sessionID: 'session-1' },
      }),
    ).toBeUndefined();
  });

  it('does not return a session id for other events', () => {
    expect(
      idleSessionID({
        type: 'session.compacted',
        properties: { sessionID: 'session-1' },
      }),
    ).toBeUndefined();
  });
});
