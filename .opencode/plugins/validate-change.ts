import type { Plugin } from '@opencode-ai/plugin';
import type { Event } from '@opencode-ai/sdk';
import { validateChange } from '../../.agents/hooks/validate-change.ts';

const fileEditingTools = new Set(['edit', 'write', 'apply_patch']);

export function isFileEditingTool(tool: string) {
  return fileEditingTools.has(tool);
}

export function idleSessionID(event: Event) {
  return event.type === 'session.status' &&
    event.properties.status.type === 'idle'
    ? event.properties.sessionID
    : undefined;
}

export const ValidateChangePlugin: Plugin = async ({ client, worktree }) => {
  const editedSessions = new Set<string>();
  let validationInProgress = false;

  return {
    'tool.execute.after': async ({ tool, sessionID }) => {
      if (isFileEditingTool(tool)) {
        editedSessions.add(sessionID);
      }
    },
    event: async ({ event }) => {
      const sessionID = idleSessionID(event);

      if (
        sessionID === undefined ||
        !editedSessions.has(sessionID) ||
        validationInProgress
      ) {
        return;
      }

      validationInProgress = true;

      try {
        const result = await validateChange(worktree);

        if (result.ok) {
          editedSessions.delete(sessionID);
          return;
        }

        await client.app.log({
          body: {
            service: 'validate-change',
            level: 'error',
            message: result.output,
          },
        });
        await client.tui.showToast({
          body: {
            message: '`npm run agent:check` failed. See the OpenCode log.',
            variant: 'error',
          },
        });
      } finally {
        validationInProgress = false;
      }
    },
  };
};
