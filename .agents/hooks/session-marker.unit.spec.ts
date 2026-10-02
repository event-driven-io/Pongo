import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  markerPath,
  parseHookInput,
  sessionMarkerName,
} from './session-marker.ts';

describe('session marker', () => {
  it('reads the hook fields from JSON input', () => {
    expect(
      parseHookInput(
        JSON.stringify({
          cwd: '/repository',
          session_id: 'session-1',
          stop_hook_active: true,
        }),
      ),
    ).toEqual({
      cwd: '/repository',
      session_id: 'session-1',
      stop_hook_active: true,
    });
  });

  it.each(['', 'not json', 'null', '42'])(
    'treats hook input %j as empty',
    (text) => {
      expect(parseHookInput(text)).toEqual({});
    },
  );

  it('uses a session id made of letters, digits, dashes and underscores as the marker name', () => {
    expect(sessionMarkerName({ session_id: 'Session_1-a' })).toBe(
      'Session_1-a',
    );
  });

  it.each(['', '../escape', 'nested/session', '..', 'C:\\session', 42])(
    'does not use session id %j as the marker name',
    (sessionId) => {
      expect(
        sessionMarkerName({ session_id: sessionId as string }),
      ).toBeUndefined();
    },
  );

  it('places the session marker in the agent check cache of the repository', () => {
    expect(markerPath({ session_id: 'session-1' }, '/repository')).toBe(
      join(
        '/repository',
        'src/node_modules/.cache/pongo-agent-check/session-1',
      ),
    );
  });

  it('has no session marker when the session id is not valid', () => {
    expect(
      markerPath({ session_id: '../escape' }, '/repository'),
    ).toBeUndefined();
  });
});
