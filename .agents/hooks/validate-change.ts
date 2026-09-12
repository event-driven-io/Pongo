import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

type HookInput = {
  stop_hook_active?: boolean;
};

export function validateChange(root = repositoryRoot) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "agent:check"], {
    cwd: resolve(root, "src"),
    encoding: "utf8",
    windowsHide: true,
  });

  return {
    ok: result.status === 0,
    output: [result.stdout, result.stderr, result.error?.message]
      .filter(Boolean)
      .join("\n")
      .trim(),
  };
}

function readHookInput(): HookInput {
  try {
    const input: unknown = JSON.parse(readFileSync(0, "utf8") || "{}");
    return typeof input === "object" && input !== null
      ? (input as HookInput)
      : {};
  } catch {
    return {};
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const input = readHookInput();

  if (!input.stop_hook_active) {
    const result = validateChange();

    if (!result.ok) {
      console.error(
        ["`npm run agent:check` failed.", result.output]
          .filter(Boolean)
          .join("\n\n"),
      );
      process.exitCode = 2;
    }
  }
}
