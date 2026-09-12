import type { Plugin } from "@opencode-ai/plugin";
import { validateChange } from "../../.agents/hooks/validate-change.ts";

export const ValidateChangePlugin: Plugin = async ({ client, worktree }) => {
  let validationInProgress = false;

  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle" || validationInProgress) {
        return;
      }

      validationInProgress = true;

      try {
        const result = validateChange(worktree);

        if (result.ok) {
          return;
        }

        console.error(result.output);
        await client.tui.showToast({
          body: {
            message: "`npm run agent:check` failed. See the OpenCode log.",
            variant: "error",
          },
        });
      } finally {
        validationInProgress = false;
      }
    },
  };
};
