# Delorean — Implementation Plan

## Context

Delorean is a TypeScript package that orchestrates LLM agents through a multi-phase development workflow. It implements the Ralph Wiggum loop pattern — repeatedly invoking an agent with fresh context while the filesystem carries state between iterations. Extensible via `delorean.config.ts`. LLM-agnostic through a thin adapter interface (ships with Claude Agent SDK adapter).

Lives inside Pongo as a workspace package for now, extractable later.

## Design philosophy

Everything is a plain object. Phases and hooks are exported as factory functions that return typed objects. Users import them, spread them, override properties. No magic string resolution, no hidden registries.

**One primitive: Hook.** Guardrails, steps, and lifecycle callbacks are all hooks. A guardrail is a hook with `severity: 'error'` (blocks on failure). A git commit is a hook with `when: 'on-success'`. No aliases, no separate concepts. Severity levels (`error`/`warn`/`info`) work like eslint rules.

```typescript
import { defineConfig, phases, hooks } from "@pongo/delorean";

export default defineConfig({
  phases: [
    phases.brainstorm(),
    phases.spec(),
    phases.plan(),
    phases.execute({ allowedTools: ["Read", "Edit", "Bash"] }),
    phases.review(),
  ],
  hooks: [
    hooks.build(), // severity: 'error', when: 'after'
    hooks.lint({ command: "npx biome check" }), // severity: 'error', when: 'after'
    hooks.test({ command: "npm run test:unit" }), // severity: 'error', when: 'after'
    hooks.noTestRegression(), // severity: 'error', when: 'after'
    hooks.diffSizeCheck({ maxDeleteRatio: 3 }), // severity: 'error', when: 'after'
    hooks.gitCommit(), // when: 'on-success'
    hooks.gitContext(), // when: 'before'
  ],
});
```

## Package structure

```
packages/delorean/
├── src/
│   ├── index.ts              # Public API: defineConfig, phases, hooks
│   ├── cli.ts                # CLI entry point
│   ├── types.ts              # All type definitions
│   ├── phases/
│   │   ├── index.ts          # Factory functions: brainstorm(), spec(), plan(), execute(), review()
│   │   ├── brainstorm.ts     # Q&A phase → qa.md
│   │   ├── spec.ts           # Generate spec → spec.md
│   │   ├── plan.ts           # Generate plan → plan.md
│   │   ├── execute.ts        # Loop execution
│   │   └── review.ts         # Review phase — validates output quality
│   ├── hooks/
│   │   ├── index.ts          # Factory functions: build(), test(), gitCommit(), gitContext(), etc.
│   │   ├── shell.ts          # Shell command runner (used by build, lint, test hooks)
│   │   ├── git-commit.ts     # Auto-commit after error-severity hooks pass
│   │   ├── git-context.ts    # Gather git log/diff for prompt preamble
│   │   ├── git-rollback.ts   # Reset to last good commit on regression
│   │   ├── context-gather.ts # Assemble situation report
│   │   └── drift.ts          # Test regression + diff size checks
│   ├── llm/
│   │   ├── types.ts          # LLM adapter interface
│   │   ├── claude-cli.ts     # Default: spawns `claude` CLI (uses Pro subscription, no API costs)
│   │   ├── claude-sdk.ts     # Optional: uses @anthropic-ai/claude-agent-sdk (API credits)
│   │   └── mock-adapter.ts   # Scriptable mock for testing — exported as createMockAdapter()
│   ├── lessons/
│   │   ├── types.ts          # Lesson strategy interface
│   │   ├── strategies.ts     # Built-in strategies (recent, budget, digest)
│   │   └── store.ts          # Lesson storage + retrieval
│   ├── logging/
│   │   ├── jsonl.ts          # Machine-readable JSONL logger
│   │   └── markdown.ts       # Human-readable markdown session log
│   ├── prompts/
│   │   ├── brainstorm.ts     # Default brainstorm prompt template
│   │   ├── plan.ts           # Default plan prompt template
│   │   └── execute.ts        # Default execute prompt template
│   ├── state.ts              # JSON state management
│   ├── prompt-builder.ts     # Assembles iteration prompts w/ errors + lessons
│   ├── resume.ts             # Smart resume: scan for artifacts, detect entry point
│   ├── budget.ts             # Cost/token tracking and budget enforcement
│   └── config.ts             # Config loading (delorean.config.ts)
├── test/
│   ├── helpers/
│   │   ├── fixture.ts        # createFixture() — temp dir, config, state, git repo setup
│   │   └── scenarios.ts      # Canned LLM response scripts for common flows
│   ├── unit/                 # Unit tests — mock adapter, no filesystem
│   │   ├── prompt-builder.test.ts
│   │   ├── lesson-store.test.ts
│   │   ├── budget.test.ts
│   │   ├── resume.test.ts
│   │   └── config.test.ts
│   ├── integration/          # Integration tests — mock adapter + real filesystem
│   │   ├── brainstorm.test.ts
│   │   ├── execute-loop.test.ts
│   │   ├── session-resume.test.ts
│   │   ├── hook-feedback.test.ts
│   │   └── crash-recovery.test.ts
│   └── e2e/                  # End-to-end — spawns `npx delorean` as child process
│       ├── cli-flags.test.ts
│       ├── dry-run.test.ts
│       └── full-pipeline.test.ts
├── package.json
└── tsconfig.json
```

## Testing strategy

Three test layers, all using `createMockAdapter()` — no real LLM calls in CI.

### Mock adapter

Exported as part of the public API so users can test their custom phases/hooks too.

```typescript
import { createMockAdapter } from "@pongo/delorean";

// Script a sequence of responses:
const adapter = createMockAdapter({
  responses: [
    { result: "What is the primary use case?", sessionId: "session-1" },
    { result: "What about caching strategy?", sessionId: "session-1" },
    { result: "DELOREAN_DONE", sessionId: "session-1" },
  ],
});

// Or use a function for dynamic responses:
const adapter = createMockAdapter({
  handler: (prompt, options) => ({
    result: `Echo: ${prompt}`,
    sessionId: options.sessionId ?? "new-session",
    usage: { input: prompt.length, output: 20 },
  }),
});

// Assertions built in:
adapter.calls; // array of { prompt, options } for each invocation
adapter.callCount; // number of invocations
adapter.lastCall; // most recent { prompt, options }
adapter.assertCalledWith({ sessionId: "session-1" }); // check --resume was used
```

The mock adapter conforms to `LLMAdapter` — it's an async generator that yields `LLMMessage` objects, same as the real adapters. Phases can't tell the difference.

### Test fixture helper

```typescript
import { createFixture } from "../helpers/fixture";

const fixture = await createFixture({
  // Creates a temp directory with:
  config: {
    // writes delorean.config.ts
    adapter: mockAdapter,
    phases: [phases.execute()],
    hooks: [hooks.build({ command: "echo ok" })],
  },
  files: {
    // pre-populates files
    "spec.md": "Build a cache...",
    "plan.md": "## Task 1: Setup\n...",
  },
  state: {
    // writes delorean-state.json
    currentPhase: "execute",
    currentTask: 0,
    tasks: [{ id: "1", title: "Setup", prompt: "..." }],
  },
  git: true, // initializes git repo with initial commit
});

// fixture.cwd        → temp directory path
// fixture.readFile()  → read files from fixture dir
// fixture.readState() → parse delorean-state.json
// fixture.cleanup()   → remove temp dir
```

### Canned response scenarios

Pre-built response scripts for common test flows:

```typescript
import { scenarios } from "../helpers/scenarios";

// 3-question brainstorm that ends with DELOREAN_DONE
const adapter = createMockAdapter({
  responses: scenarios.brainstorm3Questions,
});

// Execute loop: task passes on first try
const adapter = createMockAdapter({ responses: scenarios.executePassFirstTry });

// Execute loop: task fails build, then passes on retry
const adapter = createMockAdapter({ responses: scenarios.executeFailThenPass });

// Execute loop: task with lessons
const adapter = createMockAdapter({ responses: scenarios.executeWithLessons });
```

### Test layers

**Unit tests** — test individual functions with mock adapter, no filesystem:

- `buildPrompt()` with various state combinations
- Lesson selection strategies
- Budget calculations
- Config validation
- Resume detection logic

**Integration tests** — test phase runtimes with mock adapter + real filesystem (temp dirs):

- Brainstorm Q&A loop: mock adapter returns questions, mock interact returns answers → verify qa.md written
- Execute loop: mock adapter + real hooks (`echo ok` / `exit 1`) → verify error feedback, lesson accumulation, state progression
- Session resume: mock adapter tracks `sessionId` in options → verify `--resume` passed on subsequent calls
- Hook feedback: error hook fails → verify error text appears in next iteration's prompt
- Crash recovery: write state mid-run → call phase runner with that state → verify it picks up where it left off

**E2E tests** — spawn `npx delorean` as a child process against a fixture directory with a mock adapter config:

- `--dry-run` → verify output lists phases and hooks, no adapter calls
- `--from execute` → verify pipeline starts at execute
- `"build a thing"` positional arg → verify brainstorm phase receives idea
- Full pipeline with mock adapter → verify all artifacts created, state completed

### E2E test pattern

```typescript
test("dry-run lists phases without invoking adapter", async () => {
  const fixture = await createFixture({
    config: { adapter: createMockAdapter({ responses: [] }) },
  });

  const result = await spawn("npx", ["delorean", "--dry-run"], {
    cwd: fixture.cwd,
  });

  expect(result.stdout).toContain("brainstorm → qa.md");
  expect(result.stdout).toContain("execute");
  expect(result.exitCode).toBe(0);
  expect(fixture.adapter.callCount).toBe(0);

  await fixture.cleanup();
});

test("execute retries on gate hook failure", async () => {
  const adapter = createMockAdapter({
    responses: scenarios.executeFailThenPass,
  });
  const fixture = await createFixture({
    config: {
      adapter,
      phases: [phases.execute()],
      hooks: [hooks.build({ command: "npm run build" })],
    },
    files: { "plan.md": "## Task 1\nImplement cache" },
    state: { tasks: [{ id: "1", title: "Cache", prompt: "Implement cache" }] },
    git: true,
  });

  await spawn("npx", ["delorean"], { cwd: fixture.cwd });

  // Adapter called twice — first attempt failed, second passed
  expect(adapter.callCount).toBe(2);
  // Second call's prompt contains error from first hook failure
  expect(adapter.calls[1].prompt).toContain("Errors from previous attempt");
  // State shows completed
  const state = await fixture.readState();
  expect(state.status).toBe("completed");

  await fixture.cleanup();
});
```

## Core type model

### Phase

```typescript
type Phase = {
  id: string;
  produces?: string; // artifact filename (e.g., 'qa.md', 'spec.md', 'plan.md')
  needs?: string[]; // required artifacts to start (e.g., ['spec.md'])
  allowedTools?: string[]; // override default tools for this phase
  sessionStrategy?: "fresh" | "resume"; // default varies by phase (see below)
  prompt?: string | ((ctx: PhaseContext) => string);
  jsonSchema?: object; // --json-schema for structured output (e.g., plan → Task[])
  hooks?: Hook[]; // merges with config-level, phase wins on id collision. severity: error/warn/info
  run?: (ctx: PhaseContext) => Promise<PhaseResult>; // fully custom phase logic
};

// Built-in factories return plain Phase objects:
// phases.brainstorm()  → { id: 'brainstorm', produces: 'qa.md', sessionStrategy: 'resume', hooks: [], ... }
// phases.spec()        → { id: 'spec', produces: 'spec.md', needs: ['qa.md'], sessionStrategy: 'resume', hooks: [], ... }
// phases.plan()        → { id: 'plan', produces: 'plan.md', needs: ['spec.md'], sessionStrategy: 'resume', jsonSchema: taskArraySchema, hooks: [], ... }
// phases.execute()     → { id: 'execute', needs: ['plan.md'], sessionStrategy: 'fresh', hooks: [gitContext(), gitCommit()], ... }
// phases.review()      → { id: 'review', sessionStrategy: 'fresh', hooks: undefined (inherits config), ... }
//
// Note: hooks: [] means "no hooks" (opt out). hooks: undefined means "inherit from config level".
// Phase-level hooks with same id as config-level hooks override them.
```

### Hook

The single primitive for all non-LLM work. Build checks, git operations, lifecycle callbacks, and custom logic are all hooks. Severity (`error`/`warn`/`info`) controls whether failures block, warn, or just log — like eslint rules.

```typescript
type Hook = {
  id: string;
  when:
    | "before"
    | "after"
    | "on-success"
    | "on-failure"
    | "before-phase"
    | "after-phase";
  severity?: "error" | "warn" | "info"; // default: 'error'. Like eslint rules.
  command?: string; // shell command shorthand (mutually exclusive with run)
  run?: (ctx: HookContext) => Promise<HookResult>; // custom logic
};

// Severity levels:
// 'error' — failure blocks progression (what severity: 'error' used to mean). Errors fed back to next iteration.
// 'warn'  — failure logged + included in prompt as warning, but does NOT block. LLM sees it, can fix optionally.
// 'info'  — result logged only. Not fed back to prompt. For telemetry, notifications, etc.
//
// Overridable at config, phase, or inline:
// hooks.lint()                          → severity: 'error' (default)
// hooks.lint({ severity: 'warn' })      → lint issues logged but don't block
// phases.execute({ hooks: [hooks.lint({ severity: 'info' })] })  → per-phase

type HookResult = {
  ok: boolean; // did the hook succeed?
  output?: string; // captured output (errors, warnings, info)
  data?: Record<string, unknown>; // arbitrary data for downstream hooks
};

// How severity + result interact:
//
// | severity | ok: true          | ok: false                                    |
// |----------|-------------------|----------------------------------------------|
// | 'error'  | continue          | BLOCK: add to <errors>, trigger on-failure   |
// | 'warn'   | continue          | CONTINUE: add to <warnings> in prompt        |
// | 'info'   | continue          | CONTINUE: log only, not in prompt            |
//
// Shell command hooks (command field): ok = exitCode === 0, output = stdout+stderr
// Custom run hooks: return { ok, output } directly
//
// For custom hooks, just return { ok: false, output: 'why it failed' }:
const myHook: Hook = {
  id: "check-coverage",
  when: "after",
  severity: "warn",
  async run(ctx) {
    const coverage = await parseCoverage(ctx.cwd);
    if (coverage < 80) {
      return {
        ok: false,
        output: `Coverage ${coverage}% is below 80% threshold`,
      };
    }
    return { ok: true };
  },
};
// With severity: 'warn', a failed result adds to <warnings> but doesn't block.
// Change to severity: 'error' and same failure blocks the iteration.

type HookContext = {
  config: DeloreanConfig;
  state: DeloreanState;
  phase: Phase;
  task?: Task; // undefined for phase-level hooks
  iteration: number;
  cwd: string;
  logger: Logger;
};
```

**Built-in hook factories**:

```typescript
// Error-severity hooks (severity: 'error', when: 'after') — block on failure:
hooks.build(); // command: 'npm run build'
hooks.lint(); // command: 'npm run lint'
hooks.test(); // command: 'npm run test'
hooks.noTestRegression(); // custom run: compares test count to previous
hooks.diffSizeCheck(); // custom run: checks git diff ratio

// Lifecycle hooks (severity: 'info'):
hooks.gitContext(); // when: 'before' — gathers git log/diff for prompt
hooks.gitCommit(); // when: 'on-success' — commits after gates pass
hooks.gitRollback(); // when: 'on-failure' — resets on regression
hooks.contextGather(); // when: 'before' — assembles situation report

// Override severity or command:
hooks.build({ command: "npx tsc --noEmit" });
hooks.lint({ severity: "warn" }); // lint issues don't block, but LLM sees them
hooks.test({ command: "npm run test:unit -- --reporter=verbose" });
```

**Custom hooks** — just an object conforming to `Hook`:

```typescript
// Custom error-severity hook (blocks on failure):
const securityScan: Hook = {
  id: "security-scan",
  when: "after",
  severity: "error",
  command: "npx audit-ci --moderate",
};

// Custom warning hook (logged, visible to LLM, doesn't block):
const bundleSize: Hook = {
  id: "bundle-size",
  when: "after",
  severity: "warn",
  command: "npx size-limit",
};

// Custom hook with logic:
const notifySlack: Hook = {
  id: "notify-slack",
  when: "after-phase",
  async run(ctx) {
    await fetch(SLACK_WEBHOOK, {
      method: "POST",
      body: JSON.stringify({ text: `Phase ${ctx.phase.id} completed` }),
    });
    return { passed: true };
  },
};

// Use them:
defineConfig({
  hooks: [hooks.build(), hooks.test(), securityScan, notifySlack],
});
```

### Hook resolution hierarchy

Hooks can be set at two levels. Phase-level merges with (or overrides) config-level:

```
1. Config level (defaults for all phases):
   defineConfig({ hooks: [hooks.build(), hooks.test(), hooks.gitCommit()] })

2. Phase level (merges or overrides per phase):
   phases.execute({ hooks: [hooks.build(), hooks.gitContext()] })
```

**Resolution at runtime**: Phase runner collects hooks from both levels. Deduplicates by `id` — phase-level wins when IDs collide. Phases can opt out with `hooks: []`.

**Execution order within an iteration**:

```
before hooks → LLM invocation → after hooks (severity checked) → on-success/on-failure hooks
```

Error-severity hooks run during the `after` phase. If any `error` hook fails, execution skips `on-success` and runs `on-failure`. Warning failures are logged and fed to the prompt but don't block.

```typescript
// Config-level hooks apply to all phases by default:
defineConfig({
  hooks: [
    hooks.build(), // severity: 'error', after
    hooks.test(), // severity: 'error', after
    hooks.gitCommit(), // on-success
  ],
});

// Phase with no hooks — explicitly empty:
phases.brainstorm({ hooks: [] });

// Phase with extra hooks — merged with config:
phases.execute({
  hooks: [
    hooks.gitContext(), // before (added)
    hooks.build({ command: "npx tsc" }), // overrides config's build (same id)
    hooks.noTestRegression(), // severity: 'error' (added)
  ],
});

// Custom hook alongside built-ins:
phases.review({
  hooks: [securityScan, notifySlack], // merged with config hooks
});
```

### Full config

```typescript
type DeloreanConfig = {
  model?: string; // default: 'claude-sonnet-4-6'
  adapter?: LLMAdapter; // default: createClaudeCliAdapter()
  maxIterations?: number; // default: 10
  completionPromise?: string; // default: 'DELOREAN_DONE'
  timeoutPerIteration?: number; // ms, default: 300_000

  phases?: Phase[]; // default: [brainstorm(), spec(), plan(), execute(), review()]
  hooks?: Hook[]; // default: [build(), test(), gitCommit()]
  lessonStrategy?: LessonStrategy; // default: 'token-budget'

  budget?: {
    maxCostPerRun?: number; // USD
    maxCostPerIteration?: number; // USD
    warnAt?: number; // ratio (0-1)
  };

  git?: {
    commitPrefix?: string; // default: 'delorean'
  };

  stopPoints?: {
    betweenPhases?: boolean; // default: true
    onErrorHookFailure?: number; // consecutive error-severity failures before pause
    tasks?: string[]; // task ids that need human review
  };

  interact?: (question: string) => Promise<string>;
};
```

## Smart resume

On startup, Delorean scans the working directory for artifacts and determines where to begin:

1. `delorean-state.json` exists → resume from saved state (highest priority)
2. `plan.md` exists → skip to execute phase
3. `spec.md` exists → skip to plan phase
4. `qa.md` exists → skip to spec phase
5. Nothing found → start from first configured phase

CLI overrides:

```
npx delorean                           # smart resume
npx delorean --from plan               # force start from plan phase
npx delorean --from execute            # force start from execute
npx delorean "build a cache layer"     # inline idea → brainstorm
npx delorean --idea "build a cache"    # same, explicit flag
npx delorean --dry-run                 # preview without invoking LLM
```

The `produces`/`needs` fields on phases drive this: if a phase's `produces` artifact already exists, that phase is skipped. If a phase's `needs` artifacts are missing, Delorean errors with a clear message.

## Context engineering

How we structure prompts for Claude. These principles apply across all phases but matter most for the execute loop where fresh-context invocations need maximum information density.

Ref: Anthropic's prompt engineering docs recommend XML tags for API/orchestration prompts.

### XML tags for all structural boundaries

Use XML tags (`<task>`, `<errors>`, `<lessons>`, `<progress>`) instead of markdown headers. Reasons:

- **No collision with content** — markdown headers inside code snippets break markdown-structured prompts. XML never collides.
- **Attributes for metadata** — `<error source="npm run build" exit_code="1">` carries context that markdown can't express.
- **Deterministic parsing** — Claude mirrors XML in output; we can extract `LESSON:` patterns and structured data cleanly.

### Prompt layout: two-part delivery

Prompts are split into **system prompt** (via `--append-system-prompt`) and **user prompt** (via `-p`):

**System prompt** (static, persistent):

```
<rules>         → behavioral constraints, completion signal instruction
<lessons>       → categorized, 15-20 max, ordered by primacy/recency
```

**User prompt** (dynamic, per-iteration):

```
<task>           → current work item (index, total, prompt)
<progress>       → completed tasks, modified files
<git_context>    → recent log, diff stat
<errors>         → error-severity hook failures with raw output (only if previous iteration failed)
<prior_attempts> → what was tried and what happened (only after 3+ iterations on same task)
```

### Primacy/recency ordering

Claude pays most attention to the **beginning** and **end** of sections. Middle gets least attention. For lessons:

- Position 1: most critical / most recently violated
- Middle: general knowledge
- Last position: second-most important rule

For errors: put the most relevant/actionable error first, not necessarily the first one chronologically.

### Error formatting

- Preserve **raw compiler/test output** — don't reformat. Claude recognizes TypeScript errors, vitest failures, biome violations natively.
- Include the **command** and **exit code** as XML attributes.
- **Truncation**: full output for compiler/linter errors. For >200 lines: keep first 50 + last 50, summarize middle.
- Don't wrap errors in code blocks inside XML tags (redundant delimiter).

### Lessons formatting

- **Categorized** by topic: `<category name="build-system">`, `<category name="testing">`, `<category name="past-mistakes">`
- **In system prompt** — they're standing orders that apply across the entire invocation
- **Capped at 15-20** — beyond that, individual lesson attention drops
- **Merged** when similar — `addLesson` deduplicates by category + semantic similarity
- Recently violated lessons get **promoted** to position 1

### Context budget

The sweet spot for complex coding tasks is **under 50K tokens** of prompt. Beyond that, attention quality degrades. The prompt builder tracks estimated token count (chars / 4) and compresses if needed:

1. Summarize completed tasks to one-liners
2. Drop git context older than last 5 commits
3. Compress prior attempts to single lines
4. If still over budget, drop lowest-priority lessons

## LLM adapter interface

```typescript
type LLMMessage = {
  role: "assistant" | "system";
  content: string;
  tokenUsage?: { input: number; output: number };
  sessionId?: string; // captured from CLI output, stored for --resume
};

type LLMAdapter = {
  invoke(prompt: string, options: LLMInvokeOptions): AsyncGenerator<LLMMessage>;
};

type LLMInvokeOptions = {
  model?: string;
  cwd?: string;
  allowedTools?: string[];
  maxTurns?: number;
  systemPrompt?: string;
  appendSystemPrompt?: string; // --append-system-prompt (adds to default, safer)
  sessionId?: string; // --resume <id> to continue a session
  effort?: "low" | "medium" | "high"; // --effort flag
};
```

### CLI adapter (default) — `createClaudeCliAdapter()`

Spawns `claude` CLI as a child process. Uses existing Pro/Max subscription. Zero API cost.

Ref: https://docs.anthropic.com/en/docs/claude-code/cli-usage

#### Output formats and parsing

The CLI supports two output formats. We use **both** depending on whether we need streaming.

**`--output-format json`** — Single JSON object after completion. Used for simple phases (spec, plan, review).

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "result": "Here is the generated spec...",
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567
  },
  "structured_output": null
}
```

Parsing: `JSON.parse(stdout)` → extract `result` as content, `usage` as token counts, `session_id` for resume.

```typescript
const proc = spawn("claude", [
  "-p",
  prompt,
  "--output-format",
  "json",
  ...flags,
]);
let stdout = "";
proc.stdout.on("data", (chunk) => {
  stdout += chunk;
});
proc.on("close", (code) => {
  const output = JSON.parse(stdout);
  // output.result       → the response text
  // output.session_id   → store in state for --resume
  // output.usage        → feed to budget manager
});
```

**`--output-format stream-json`** — NDJSON (one JSON object per line), real-time. Used for execute phase where we want to see progress and parse lessons as they appear.

Each line is a complete JSON object. The key event types:

```json
{"type":"system","subtype":"init","session_id":"550e8400-...","tools":[...]}
{"type":"assistant","message":{"type":"text","text":"I'll fix that bug..."}}
{"type":"tool_use","tool":"Edit","input":{"file_path":"src/cache.ts",...}}
{"type":"tool_result","tool":"Edit","output":"File edited successfully"}
{"type":"assistant","message":{"type":"text","text":"LESSON: [perf] use batch inserts"}}
{"type":"result","result":"Done.","session_id":"550e8400-...","usage":{"input_tokens":2100,"output_tokens":890}}
```

Parsing: read stdout line-by-line, `JSON.parse` each line, route by `type`:

```typescript
const proc = spawn('claude', ['-p', prompt, '--output-format', 'stream-json', ...flags]);
const rl = createInterface({ input: proc.stdout });

for await (const line of rl) {
  const event = JSON.parse(line);

  switch (event.type) {
    case 'system':
      if (event.subtype === 'init') sessionId = event.session_id;
      break;
    case 'assistant':
      yield { role: 'assistant', content: event.message.text, sessionId };
      break;
    case 'result':
      yield {
        role: 'system',
        content: event.result,
        sessionId: event.session_id,
        tokenUsage: event.usage,
      };
      break;
  }
}
```

#### Session resumption via CLI

The CLI has built-in session management. Each invocation returns a `session_id`. Passing `--resume <session_id>` continues the conversation with full prior context preserved.

| Flag                | What it does                      |
| ------------------- | --------------------------------- |
| `--resume <id>`     | Resume specific session by ID     |
| `--continue` / `-c` | Resume most recent session        |
| `--fork-session`    | Create new session ID (branching) |

**How Delorean uses this**: Store `session_id` in `delorean-state.json` per phase. Phases with `sessionStrategy: 'resume'` pass `--resume <session_id>` on subsequent calls. Phases with `sessionStrategy: 'fresh'` omit it — each invocation starts clean.

```typescript
const args = ["-p", prompt, "--output-format", "stream-json"];

if (options.sessionId) {
  args.push("--resume", options.sessionId);
}
if (options.allowedTools?.length) {
  args.push("--allowedTools", options.allowedTools.join(","));
}
if (options.model) {
  args.push("--model", options.model);
}
if (options.maxTurns) {
  args.push("--max-turns", String(options.maxTurns));
}
if (options.appendSystemPrompt) {
  args.push("--append-system-prompt", options.appendSystemPrompt);
}
if (options.effort) {
  args.push("--effort", options.effort);
}
```

#### Session strategy per phase

Phases declare how they handle sessions:

```typescript
type Phase = {
  // ... existing fields ...
  sessionStrategy?: "fresh" | "resume"; // default varies by phase
};

// Defaults:
// brainstorm → 'resume' (Q&A needs conversation continuity)
// spec       → 'resume' (can continue from brainstorm context)
// plan       → 'resume' (can continue from spec context)
// execute    → 'fresh'  (Ralph Wiggum loop — filesystem is memory)
// review     → 'fresh'  (clean evaluation, no prior bias)
```

When `sessionStrategy: 'resume'`:

- First invocation in the phase: no `--resume` flag, capture `session_id` from output
- Subsequent invocations: pass `--resume <session_id>`
- `session_id` stored in `delorean-state.json` under `sessions: { [phaseId]: string }`

When `sessionStrategy: 'fresh'`:

- Every invocation is a new session (no `--resume`)
- Lessons, errors, and context assembled via prompt builder instead
- This is where the lesson system earns its keep

#### Error handling and edge cases

```typescript
// Process exit codes
proc.on("close", (code) => {
  if (code !== 0) {
    // Capture stderr for error message
    throw new CliAdapterError(`claude exited with code ${code}`, stderr);
  }
});

// Timeout — kill process after timeoutPerIteration
const timer = setTimeout(() => {
  proc.kill("SIGTERM");
  setTimeout(() => proc.kill("SIGKILL"), 5000); // force kill after 5s grace
}, options.timeout ?? 300_000);

// Broken JSON lines (partial writes, interrupted process)
for await (const line of rl) {
  try {
    const event = JSON.parse(line);
    // ... handle event
  } catch {
    // Log malformed line but don't crash — CLI might emit non-JSON warnings to stdout
    logger.warn("unparseable CLI output line", { line });
  }
}
```

#### Full CLI flag reference (used by adapter)

```bash
claude -p "prompt"                      # non-interactive mode (required)
  --output-format json|stream-json      # output format
  --allowedTools Read,Edit,Bash         # pre-approve tools (no prompting)
  --disallowedTools Agent               # block specific tools
  --model claude-sonnet-4-6             # model selection
  --max-turns 10                        # limit agentic turns
  --resume <session-id>                 # continue previous session
  --append-system-prompt "..."          # add to system prompt (safer than --system-prompt)
  --effort high                         # reasoning effort level
  --verbose                             # full turn-by-turn output in stream
  --no-session-persistence              # don't save session to disk (for disposable runs)
```

Ref: https://docs.anthropic.com/en/docs/claude-code/cli-usage#non-interactive-mode

#### Factory options

```typescript
type ClaudeCliAdapterOptions = {
  claudePath?: string; // default: 'claude' (found via PATH)
  outputFormat?: "json" | "stream-json"; // default: 'stream-json'
  verbose?: boolean; // default: false
  noSessionPersistence?: boolean; // default: false (set true for execute phase disposable runs)
};

// Usage:
createClaudeCliAdapter(); // all defaults
createClaudeCliAdapter({ claudePath: "/usr/local/bin/claude" }); // custom binary
createClaudeCliAdapter({ outputFormat: "json" }); // buffered mode
```

### SDK adapter (optional) — `createClaudeSdkAdapter()`

Alternative for users with API credits. Uses `@anthropic-ai/claude-agent-sdk` `query()`. Listed as optional peer dependency — package works without it installed.

```typescript
import { createClaudeSdkAdapter } from "@pongo/delorean";
defineConfig({ adapter: createClaudeSdkAdapter() }); // requires ANTHROPIC_API_KEY
```

Ref: https://docs.anthropic.com/en/docs/agents/claude-code/sdk

Not detailed further here — CLI adapter is the primary path.

## Context gathering

Each iteration prompt starts with a situation report (assembled by `steps.gitContext()` + `steps.contextGather()`):

- `git log --oneline -10` — recent history
- `git diff --stat HEAD~1` — what changed last iteration
- Current task index and total (e.g., "Task 3/8")
- Summary of completed tasks
- File tree of modified files across this session

## Default prompt templates

### Brainstorm prompt

```
Ask me one question at a time so we can develop a thorough, step-by-step spec
for this idea. Each question should build on my previous answers, and our end
goal is to have a detailed specification I can hand off to a developer. Let's
do this iteratively and dig into every relevant detail. Remember, only one
question at a time.

Once we are done, save the spec as spec.md
Before asking another question store the previous one with the answer forming qa.md

Here's the idea: {idea}
```

### Plan prompt

```
Draft a detailed, step-by-step blueprint for building this project. Then, once
you have a solid plan, break it down into small, iterative chunks that build on
each other. Look at these chunks and then go another round to break it into
small steps. Review the results and make sure that the steps are small enough
to be implemented safely with strong testing, but big enough to move the
project forward. Iterate until you feel that the steps are right sized.

From here provide a series of prompts for a code-generation LLM that will
implement each step in a test-driven manner. Prioritize best practices,
incremental progress, and early testing. Each prompt should build on previous
ones and end with wiring things together. No hanging or orphaned code.

Store the plan in plan.md.
The spec is in the file called: {specFile}
```

Override via factory params:

```typescript
phases.brainstorm({ prompt: "my custom brainstorm prompt with {idea}" });
```

## Phase details

### 1. Brainstorm (qa.md)

- LLM asks one question at a time via the `interact` hook
- Each Q&A pair appended to `qa.md` and stored in state
- User says "done" or a configured keyword → phase ends
- Produces: `qa.md`

### 2. Spec (spec.md)

- LLM generates spec from qa.md
- Pauses for user approval (stop point)
- Needs: `qa.md` | Produces: `spec.md`

### 3. Plan (plan.md)

- LLM breaks spec into ordered, test-driven prompts
- Each prompt becomes a `Task` in delorean-state.json
- Pauses for user approval (stop point)
- Needs: `spec.md` | Produces: `plan.md`

### 4. Execute (the loop)

For each task in order:

1. Run `before` steps (git context gathering, hooks)
2. **Build prompt**: task + selected lessons + hook errors/warnings from last failure
3. **Invoke LLM** via adapter, stream output, log everything
4. **Parse lessons** from output (`LESSON: [category] description`)
5. Run `after` hooks in configured order — check severity on failure
6. All `error` hooks pass → run `on-success` hooks (git commit) → advance
7. **Any `error` hook fails** → run `on-failure` hooks (capture errors) → retry same task
8. Stop point → pause, invoke `interact` hook
9. Max iterations → fail

- Needs: `plan.md`

### 5. Review

- LLM reviews changes, checks for quality issues
- Can trigger fix iterations if problems found
- Runs hooks one final time
- Custom stop point tasks pause for human review

## Error feedback loop

```
Iteration N: LLM writes code → build fails
                              ↓
                  Error captured with full stdout/stderr (last 200 lines)
                              ↓
Iteration N+1 prompt:
  "## Errors from previous attempt
   ### build (exit code 1)
   src/cache.ts(14,25): error TS2307: Cannot find module 'foo'

   Fix these errors before proceeding."
                              ↓
                  LLM sees errors, fixes them
```

Errors cleared only after the hook that produced them passes.

## Lesson selection strategies

All lessons always persisted. Strategy controls what goes into the prompt.

| Strategy       | How it works                                                        |
| -------------- | ------------------------------------------------------------------- |
| `recent`       | Last N (default 10) + category matches                              |
| `token-budget` | Score by relevance + recency, fit within token budget (default 500) |
| `digest`       | LLM-compressed digest + new lessons since last digest               |
| Custom         | `(lessons: Lesson[], task: Task) => Lesson[]`                       |

## Drift protection

- **Test regression** (`hooks.noTestRegression()`) — fails if test count decreases
- **Diff size** (`hooks.diffSizeCheck()`) — flags when deletes >> adds
- **Scope anchor** — prompt builder always includes original task description

## Cost and token tracking

Every invocation tracked. Logged as `{ type: 'token-usage', ... }` in JSONL. Budget config:

```typescript
budget: { maxCostPerRun: 50, maxCostPerIteration: 10, warnAt: 0.8 }
```

Exceeding budget pauses and asks via `interact` hook.

## Logging

Two parallel streams in `delorean-logs/`:

**JSONL** (`{timestamp}.jsonl`): `prompt-sent`, `response-received`, `hook-result`, `lesson-learned`, `error-captured`, `token-usage`, `git-commit`, `phase-transition`, `human-input`, `timeout`, `budget-warning`

**Markdown** (`{timestamp}.md`): human-readable session transcript.

## CLI

```
npx delorean                           # smart resume
npx delorean "build a cache layer"     # inline idea → start from brainstorm
npx delorean --idea "build a cache"    # explicit flag, same thing
npx delorean --from plan               # force start from plan phase
npx delorean --from execute            # force start from execute
npx delorean --resume                  # resume from delorean-state.json
npx delorean --max-iterations 20       # override max iterations
npx delorean --model claude-opus-4-6   # override model
npx delorean --dry-run                 # preview without invoking LLM
```

## State (delorean-state.json)

```typescript
type DeloreanState = {
  status: "idle" | "running" | "paused" | "completed" | "failed";
  currentPhase: string;
  currentTask: number;
  iteration: number;
  tasks: Task[];
  lessons: Lesson[];
  lessonDigest: string | null;
  errors: HookError[];
  qaHistory: { question: string; answer: string }[];
  sessions: Record<string, string>; // { [phaseId]: sessionId } for --resume
  cost: { total: number; perIteration: Record<number, number> };
};
```

## Implementation steps

### Step 1: Scaffold package

**Files**: `packages/delorean/package.json`, `packages/delorean/tsconfig.json`, `packages/delorean/src/index.ts`
**What**: Create the workspace package. No SDK dependency needed — CLI adapter is default. Add to root `package.json` workspaces. Minimal `src/index.ts` that exports nothing yet.
**Dependencies**: None (first step)
**Done when**: `npm install` succeeds from repo root, `npx tsc --noEmit` passes on the empty package.

### Step 2: Core types

**Files**: `packages/delorean/src/types.ts`
**What**: Define all type definitions: `Phase`, `Hook`, `HookResult`, `HookContext`, `HookError`, `LLMAdapter`, `LLMInvokeOptions`, `LLMMessage`, `DeloreanConfig`, `DeloreanState`, `PhaseContext`, `PhaseResult`, `Task`, `Lesson`, `LessonStrategy`, `IterationResult`. No runtime code — pure types. Export everything from `index.ts`.
**Dependencies**: Step 1
**Done when**: Types compile. A test file can import every type without errors.

### Step 3: LLM adapter interface + Claude CLI adapter (default)

**Files**: `packages/delorean/src/llm/types.ts`, `packages/delorean/src/llm/claude-cli.ts`
**What**: Define `LLMAdapter` interface (the `invoke` async generator). Implement CLI adapter that spawns `claude` CLI as a child process in `-p` (print/non-interactive) mode.

**CLI invocation pattern**:

```typescript
const args = ["-p", prompt];
// Output format — stream-json for real-time, json for simple phases
args.push("--output-format", options.outputFormat ?? "stream-json");
// Session resumption — key for multi-turn phases (brainstorm, spec, plan)
if (options.sessionId) args.push("--resume", options.sessionId);
// Tool control
if (options.allowedTools?.length)
  args.push("--allowedTools", options.allowedTools.join(","));
// Model selection
if (options.model) args.push("--model", options.model);
// Agentic turn limit (how many tool-use rounds per invocation, NOT conversation turns)
if (options.maxTurns) args.push("--max-turns", String(options.maxTurns));
// System prompt (append is safer — preserves Claude Code's defaults)
if (options.appendSystemPrompt)
  args.push("--append-system-prompt", options.appendSystemPrompt);
// Structured output — forces response into a JSON schema
if (options.jsonSchema)
  args.push("--json-schema", JSON.stringify(options.jsonSchema));
// Effort level
if (options.effort) args.push("--effort", options.effort);

const proc = spawn(claudePath, args, { cwd: options.cwd });
```

**Parsing `stream-json` output** (NDJSON, one event per line):

```typescript
const rl = createInterface({ input: proc.stdout });
for await (const line of rl) {
  const event = JSON.parse(line);
  switch (event.type) {
    case "system":
      // event.subtype === 'init' → capture event.session_id
      break;
    case "assistant":
      // event.message.text → yield as LLMMessage
      break;
    case "tool_use":
      // event.tool, event.input → log tool usage
      break;
    case "tool_result":
      // event.tool, event.output → log tool result
      break;
    case "result":
      // event.result → final text, event.session_id, event.usage → token counts
      break;
  }
}
```

**Parsing `json` output** (single JSON object, buffered):

```typescript
let stdout = "";
proc.stdout.on("data", (chunk) => {
  stdout += chunk;
});
proc.on("close", () => {
  const output = JSON.parse(stdout);
  // output.result           → response text
  // output.session_id       → store for --resume
  // output.usage            → { input_tokens, output_tokens }
  // output.structured_output → present when --json-schema used
});
```

**Session ID capture**: Every response includes `session_id`. The adapter yields it on `LLMMessage.sessionId`. The phase runner stores it in `state.sessions[phaseId]` and passes it back on subsequent calls for `sessionStrategy: 'resume'` phases.

**Error handling**:

- Non-zero exit → `CliAdapterError` with captured stderr
- Timeout → `SIGTERM` after `timeoutPerIteration`, then `SIGKILL` after 5s grace
- Malformed JSON lines → log warning, skip line (CLI may emit non-JSON warnings)

**Factory**: `createClaudeCliAdapter(options?)` returning `LLMAdapter`.

```typescript
type ClaudeCliAdapterOptions = {
  claudePath?: string; // default: 'claude'
  defaultOutputFormat?: "json" | "stream-json"; // default: 'stream-json'
  verbose?: boolean; // default: false
  noSessionPersistence?: boolean; // default: false
};
```

**Dependencies**: Step 2 (needs `LLMAdapter`, `LLMMessage`, `LLMInvokeOptions` types)
**Test**:

- Unit: mock child process emitting JSON lines → verify `LLMMessage` objects yielded with correct content, sessionId, tokenUsage
- Unit: mock child process emitting buffered JSON → verify single LLMMessage with result, sessionId, usage
- Unit: `--resume` flag passed when `options.sessionId` set, omitted when not
- Unit: `--json-schema` flag passed when `options.jsonSchema` set
- Unit: timeout → process killed, error thrown with descriptive message
- Unit: non-zero exit → error with stderr content
- Unit: malformed JSON line → warning logged, parsing continues
- Integration (guarded by `which claude`): invoke `claude -p "say hello" --output-format json` → verify response has `result`, `session_id`, `usage` fields
- Integration: two sequential calls with `--resume` → verify second call has context from first
  **Done when**: Both output formats parse correctly. Session IDs captured and re-passed. Timeouts, errors, and malformed output handled gracefully.

### Step 3b: Mock adapter + test infrastructure

**Files**: `packages/delorean/src/llm/mock-adapter.ts`, `packages/delorean/test/helpers/fixture.ts`, `packages/delorean/test/helpers/scenarios.ts`
**What**: Build the mock adapter and test helpers that every subsequent step's tests depend on.

**`createMockAdapter(config)`** — scriptable adapter that conforms to `LLMAdapter`:

```typescript
type MockAdapterConfig = {
  // Static: return responses in order, error if exhausted
  responses?: Array<{
    result: string;
    sessionId?: string;
    usage?: { input: number; output: number };
    toolUses?: Array<{ tool: string; input: object; output: string }>;
  }>;
  // Dynamic: generate response based on prompt/options
  handler?: (prompt: string, options: LLMInvokeOptions) => MockResponse;
};

type MockAdapter = LLMAdapter & {
  calls: Array<{ prompt: string; options: LLMInvokeOptions }>;
  callCount: number;
  lastCall: { prompt: string; options: LLMInvokeOptions };
  assertCalledWith(partial: Partial<LLMInvokeOptions>): void;
  assertPromptContains(text: string, callIndex?: number): void;
  reset(): void;
};
```

The `invoke` async generator yields `LLMMessage` objects matching the shape the CLI adapter produces. For `responses` mode, each call consumes the next response. For `handler` mode, the function is called per invocation.

**`createFixture(config)`** — creates an isolated temp directory for integration/e2e tests:

```typescript
type FixtureConfig = {
  config?: Partial<DeloreanConfig>; // writes delorean.config.ts
  files?: Record<string, string>; // creates files in fixture dir
  state?: Partial<DeloreanState>; // writes delorean-state.json
  git?: boolean; // git init + initial commit
};

type Fixture = {
  cwd: string;
  readFile(path: string): Promise<string>;
  readState(): Promise<DeloreanState>;
  readLog(): Promise<string>; // reads latest JSONL log
  fileExists(path: string): Promise<boolean>;
  gitLog(): Promise<string>; // git log --oneline
  cleanup(): Promise<void>;
};
```

Key detail: `createFixture` writes a real `delorean.config.ts` that imports the mock adapter, so e2e tests spawning `npx delorean` get the mock automatically.

**`scenarios`** — pre-built response arrays for common test flows:

- `scenarios.brainstorm3Questions` — 3 questions + completion signal
- `scenarios.brainstormUserSaysDone` — 2 questions, user exits early
- `scenarios.specFromQa` — generates spec content from qa context
- `scenarios.planWith5Tasks` — returns structured `{ tasks: [...] }` via `structured_output`
- `scenarios.executePassFirstTry` — task passes all hooks
- `scenarios.executeFailThenPass` — fails build, second try passes
- `scenarios.executeWithLessons` — response includes `LESSON:` patterns
- `scenarios.executeTestRegression` — response causes test count to drop

**Dependencies**: Step 2 (types), Step 3 (LLMAdapter interface — mock must conform)
**Test**: Mock adapter itself needs tests:

- `responses` mode: 3 responses configured → 3 calls work, 4th throws
- `handler` mode: handler receives correct prompt and options
- `calls` tracking: after 3 invocations, `callCount === 3`, `lastCall` is most recent
- `assertCalledWith({ sessionId: 'abc' })` passes when sessionId was passed, throws when not
- `assertPromptContains('error')` checks prompt text at given call index
- `reset()` clears call history
- Fixture: creates temp dir, writes config/state/files, cleanup removes everything
- Fixture: `readState()` returns parsed state, `fileExists()` checks artifacts
  **Done when**: Mock adapter passes all assertion tests. Fixture creates/cleans temp dirs. Scenarios produce correctly shaped responses. All three are importable from test helpers.

### Step 3c (optional): Claude SDK adapter

**Files**: `packages/delorean/src/llm/claude-sdk.ts`
**What**: Alternative adapter using `@anthropic-ai/claude-agent-sdk` `query()`. For users with API credits who want better streaming and programmatic control. `@anthropic-ai/claude-agent-sdk` as an optional peer dependency.
**Dependencies**: Step 2
**Test**: Unit test with mocked `query()`. Integration test guarded by `ANTHROPIC_API_KEY` env var.
**Done when**: `createClaudeSdkAdapter()` works as a drop-in replacement for the CLI adapter. Package doesn't crash if `claude-agent-sdk` isn't installed.

### Step 4: Phase and hook factories

**Files**: `packages/delorean/src/phases/index.ts`, `packages/delorean/src/hooks/index.ts` (factory functions only — no runtime logic yet)
**What**: Factory functions that return plain typed objects with sensible defaults.

Phase factories:

- `phases.brainstorm(overrides?)` → `{ id: 'brainstorm', produces: 'qa.md', sessionStrategy: 'resume', hooks: [], ... }`
- `phases.spec(overrides?)` → `{ id: 'spec', produces: 'spec.md', needs: ['qa.md'], sessionStrategy: 'resume', hooks: [], ... }`
- `phases.plan(overrides?)` → `{ id: 'plan', produces: 'plan.md', needs: ['spec.md'], sessionStrategy: 'resume', hooks: [], ... }`
- `phases.execute(overrides?)` → `{ id: 'execute', needs: ['plan.md'], sessionStrategy: 'fresh', hooks: [gitContext(), gitCommit()], ... }`
- `phases.review(overrides?)` → `{ id: 'review', sessionStrategy: 'fresh', ... }`

Hook factories (all return `Hook` objects):

- `hooks.build(overrides?)` → `{ id: 'build', when: 'after', severity: 'error', command: 'npm run build' }`
- `hooks.lint(overrides?)` → `{ id: 'lint', when: 'after', severity: 'error', command: 'npm run lint' }`
- `hooks.test(overrides?)` → `{ id: 'test', when: 'after', severity: 'error', command: 'npm run test' }`
- `hooks.noTestRegression(overrides?)` → `{ id: 'no-test-regression', when: 'after', severity: 'error', run: ... }`
- `hooks.diffSizeCheck(overrides?)` → `{ id: 'diff-size-check', when: 'after', severity: 'error', run: ... }`
- `hooks.gitContext(overrides?)` → `{ id: 'git-context', when: 'before', run: ... }`
- `hooks.gitCommit(overrides?)` → `{ id: 'git-commit', when: 'on-success', run: ... }`
- `hooks.gitRollback(overrides?)` → `{ id: 'git-rollback', when: 'on-failure', run: ... }`
- `hooks.contextGather(overrides?)` → `{ id: 'context-gather', when: 'before', run: ... }`

Each override param is `Partial<Phase>` or `Partial<Hook>`. The factory merges overrides onto defaults.
**Dependencies**: Step 2 (needs types)
**Test**: For each factory: call with no args → assert all required fields present with correct defaults. Call with overrides → assert overrides applied, defaults preserved for unspecified fields. Verify:

- `phases.execute({ allowedTools: ['Read'] })` → has `allowedTools: ['Read']` and default hooks
- `hooks.build({ command: 'npx tsc' })` → has `command: 'npx tsc'` but still `severity: 'error'`, `when: 'after'`
- `hooks.build()` returns a `Hook` with `severity: 'error'`
- Custom hook object `{ id: 'custom', when: 'after', severity: 'error', command: 'echo ok' }` passes type check
  **Done when**: All factories exported from `index.ts`. Every factory produces a valid typed object. Override merging works. Custom hooks conform to the same type.

### Step 5: Config loader + `defineConfig`

**Files**: `packages/delorean/src/config.ts`
**What**: `defineConfig(partial)` validates and fills defaults (default phases, hooks, model, maxIterations, etc.). `loadConfig(cwd)` finds and imports `delorean.config.ts` from the working directory, calls `defineConfig` on it, merges CLI arg overrides. Validation: phases must have unique `id`s, hooks must have unique `id`s, `produces` fields must not conflict. Hook resolution: phase-level hooks merge with config-level, deduplicated by `id` (phase wins).
**Dependencies**: Step 2 (types), Step 4 (default factories used for filling defaults)
**Test**: `defineConfig({})` returns full config with all defaults. `defineConfig({ phases: [phases.execute()] })` keeps only execute. Invalid config (duplicate ids) throws descriptive error. CLI overrides (`{ model: 'claude-opus-4-6' }`) merge correctly.
**Done when**: `defineConfig` produces a fully resolved `DeloreanConfig`. `loadConfig` can import a real `.ts` config file.

### Step 6: State manager

**Files**: `packages/delorean/src/state.ts`
**What**: `loadState(cwd)` reads `delorean-state.json`, returns `DeloreanState` or `null`. `saveState(cwd, state)` writes atomically (write to `.tmp`, rename). `createInitialState(tasks)` returns a fresh state. State includes: `status`, `currentPhase`, `currentTask`, `iteration`, `tasks`, `lessons`, `errors`, `qaHistory`, `cost`.
**Dependencies**: Step 2 (needs `DeloreanState` type)
**Test**: Round-trip: create → save → load → assert equal. Atomic write: verify `.tmp` file doesn't linger. `loadState` on missing file returns `null`. Corrupt JSON throws descriptive error.
**Done when**: State persists across process restarts. Atomic writes prevent corruption on crash.

### Step 7: Smart resume

**Files**: `packages/delorean/src/resume.ts`
**What**: `detectEntryPhase(config, cwd)` scans working directory for artifacts. Algorithm:

1. If `delorean-state.json` exists and `status !== 'completed'` → return `{ resumeFrom: state.currentPhase, state }`
2. Walk `config.phases` in reverse — first phase whose `produces` file exists on disk → return the _next_ phase
3. Walk `config.phases` forward — first phase whose `needs` are all satisfied → return that phase
4. Nothing found → return first phase

`--from <phaseId>` override: validate phase exists, check `needs` are satisfied (warn if not, proceed anyway).
**Dependencies**: Step 5 (config), Step 6 (state)
**Test**: Create temp dirs with various artifact combinations:

- Empty dir → returns first phase (`brainstorm`)
- `qa.md` present → returns `spec`
- `spec.md` present → returns `plan`
- `plan.md` present → returns `execute`
- `delorean-state.json` with `currentPhase: 'execute'`, `currentTask: 3` → returns `execute` at task 3
- `--from plan` with no `spec.md` → warns but returns `plan`
  **Done when**: All artifact-detection scenarios resolve to correct phase. `--from` override works with validation.

### Step 8: Logging

**Files**: `packages/delorean/src/logging/jsonl.ts`, `packages/delorean/src/logging/markdown.ts`
**What**: Two logger implementations sharing a `Logger` interface:

- `createJsonlLogger(dir)` → appends structured events: `{ timestamp, type, ... }` per line. Types: `prompt-sent`, `response-received`, `hook-result`, `lesson-learned`, `error-captured`, `token-usage`, `git-commit`, `phase-transition`, `human-input`, `timeout`, `budget-warning`
- `createMarkdownLogger(dir)` → appends human-readable sections with headers, code blocks, timestamps

Both create files in `delorean-logs/` named `{ISO-timestamp}.{jsonl,md}`.
**Dependencies**: Step 2 (event types)
**Test**: Log a sequence of events → read file back → parse JSONL lines → assert each event has correct shape and timestamp. Markdown logger: log events → read file → assert contains expected headers and content blocks. Verify file creation with correct naming.
**Done when**: Both loggers produce parseable, timestamped output. Files appear in `delorean-logs/`.

### Step 9: Lesson store + strategies

**Files**: `packages/delorean/src/lessons/store.ts`, `packages/delorean/src/lessons/strategies.ts`, `packages/delorean/src/lessons/types.ts`
**What**: `LessonStore` persists lessons in state. `addLesson(lesson)`, `getLessons()`, `selectForPrompt(task, strategy)`.

Lesson shape:

```typescript
type Lesson = {
  id: string;
  category: string; // e.g., 'build-system', 'testing', 'code-style', 'past-mistakes'
  description: string;
  iteration: number;
  phase: string;
  taskId: string;
  violationCount: number; // incremented when same lesson re-learned (dedup signal)
  lastViolatedAt: number; // iteration number of most recent violation
};
```

**Deduplication**: `addLesson` checks for existing lessons in the same category with similar description (substring match or Levenshtein distance < threshold). If found, increments `violationCount` and updates `lastViolatedAt` instead of adding a duplicate. This keeps the lesson list tight.

**Primacy/recency ordering**: `selectForPrompt` sorts selected lessons so that:

- Position 1: highest `violationCount` (most frequently re-learned)
- Positions 2-N-1: remaining lessons by recency
- Position N: second-highest `violationCount`

This exploits Claude's attention pattern — most critical lessons at the start and end of the list.

Built-in strategies:

- `recent(n)` — last N lessons + any matching current task's category
- `tokenBudget(maxTokens)` — score by relevance (category match × recency × violationCount), fill until token budget (estimated at chars/4). Default 500 tokens.
- `digest(adapter)` — LLM-compressed summary of older lessons + raw recent ones
- Custom: `(lessons, task) => Lesson[]`

**Lesson parsing**: extracted from LLM output via `LESSON: [category] description` pattern. The system prompt instructs the LLM to output this format.

```typescript
// Parser regex: /LESSON:\s*\[(\w[\w-]*)\]\s*(.+)/g
// Input:  "LESSON: [build-system] Import paths need .js extensions for ESM"
// Output: { category: 'build-system', description: 'Import paths need .js extensions for ESM' }
```

**Dependencies**: Step 2 (types), Step 6 (state — lessons stored in state)
**Test**:

- Add 20 lessons across 4 categories. `recent(5)` returns last 5 + category matches (may exceed 5 if matches found).
- `tokenBudget(200)` returns subset fitting budget, highest-scored lessons first.
- Dedup: add two lessons with same category and similar description → only one stored, `violationCount: 2`.
- Primacy/recency: select 5 lessons → most-violated is first, second-most-violated is last.
- Lesson parsing: extract from multi-line LLM output containing code, prose, and `LESSON:` lines → only lessons extracted.
- Edge: no lessons → empty array. Single lesson → returned as-is. Lesson with unknown category → stored normally.
- Promote: after error hook failure that matches a lesson's category, that lesson's `lastViolatedAt` updates → it moves to position 1 in next selection.
  **Done when**: Strategies produce correctly ordered subsets. Dedup prevents bloat. Primacy/recency ordering verified. Parser handles realistic LLM output. Violation tracking works.

### Step 10: Built-in hook implementations

**Files**: `packages/delorean/src/hooks/shell.ts`, `packages/delorean/src/hooks/drift.ts`, `packages/delorean/src/hooks/git-commit.ts`, `packages/delorean/src/hooks/git-context.ts`, `packages/delorean/src/hooks/git-rollback.ts`, `packages/delorean/src/hooks/context-gather.ts`
**What**: Runtime implementations for all built-in hooks. Each is a `run` function wired into the corresponding hook factory from Step 4.

**Gating hooks** (severity: 'error'):

- `shell.ts` — `runShellCommand(command, cwd)`: executes shell command, captures stdout+stderr (last 200 lines), returns `{ ok: exitCode === 0, output }`. Used by `hooks.build()`, `.lint()`, `.test()` — any hook with a `command` field.
- `drift.ts` — two custom `run` functions:
  - `noTestRegression`: runs test command, parses test count from output (vitest/jest patterns), compares to previous count in state. Fails if count decreased.
  - `diffSizeCheck({ maxDeleteRatio })`: runs `git diff --stat`, parses insertions/deletions, fails if ratio exceeded.

**Lifecycle hooks** (non-gating):

- `git-context.ts` — runs `git log --oneline -10`, `git diff --stat HEAD~1`, returns context string for prompt preamble. Handles fresh repos (no HEAD~1) gracefully.
- `git-commit.ts` — stages modified/new files, commits with message `delorean: {task summary} (iteration {n})`. Configured via `git.commitPrefix`. Runs `when: 'on-success'`.
- `git-rollback.ts` — `git checkout .` to discard changes. Runs `when: 'on-failure'`, only when a gating hook with `id: 'no-test-regression'` triggered the failure.
- `context-gather.ts` — assembles situation report: current task index/total, completed task summaries, modified file tree.

**Dependencies**: Step 2 (types), Step 4 (hook factories wire these as `run` functions), Step 6 (state)
**Test**:

- `runShellCommand` with `echo "ok"` → passes. With `exit 1` → fails, captures output.
- `noTestRegression`: mock test output "Tests: 10 passed" then "Tests: 8 passed" → regression detected.
- `diffSizeCheck`: mock git diff stat with various ratios → passes/fails at threshold.
- `gitContext` in a test repo → returns formatted string with log and diff. Empty repo → graceful fallback.
- `gitCommit` → creates commit with correct prefix.
- `gitRollback` → discards working tree changes.
- `contextGather` with state containing 3/8 tasks → includes "Task 4/8" and summaries.
- Custom hook with `command: 'echo ok'` → shell runner handles it, returns passed.
- Custom hook with `run` function → function called with correct `HookContext`.
  **Done when**: All built-in hooks produce correct results. Shell runner handles any command. Custom hooks work through the same runtime path.

### Step 12: Prompt builder (context engineering)

**Files**: `packages/delorean/src/prompt-builder.ts`
**What**: `buildPrompt(config, state, task, options)` assembles the full prompt for an iteration. Uses **XML tags** for all structural boundaries (Anthropic's recommendation for API/orchestration prompts — XML never collides with code content, supports attributes, and enables deterministic parsing).

Returns two strings: `systemPrompt` (passed via `--append-system-prompt`) and `userPrompt` (passed via `-p`).

**System prompt structure** (static context, rules, lessons — primacy/recency ordering):

```xml
<rules>
- Make the minimal change needed to complete the task
- Run hooks after making changes
- When you learn something useful, output: LESSON: [category] description
- When the task is complete, output: {completionPromise}
</rules>

<lessons>
<!-- Most critical / recently violated lessons FIRST (primacy effect) -->
<category name="build-system">
- Import paths must use .js extensions (ESM requirement)
</category>
<category name="testing">
- Tests use vitest, not jest. Use vi.fn() not jest.fn()
</category>
<category name="past-mistakes">
<!-- Most important also LAST (recency effect) -->
- Do NOT add type assertions to fix type errors; fix the actual types
</category>
</lessons>
```

**User prompt structure** (dynamic context, task, errors — changes each iteration):

```xml
<task index="3" total="8">
Implement the cache invalidation logic. Add TTL-based expiry
to the CacheStore class. Write tests first (TDD).
</task>

<progress>
<completed>
- Task 1: Project scaffold (passed)
- Task 2: CacheStore basic get/set (passed)
</completed>
<modified_files>
src/cache/store.ts, src/cache/store.test.ts, src/cache/types.ts
</modified_files>
</progress>

<git_context>
abc123f Add CacheStore with basic get/set
def456a Scaffold cache package with types
</git_context>

<!-- Only present if previous iteration had hook failures -->
<errors>
<error source="npm run build" exit_code="1" severity="error">
src/cache/store.ts(42,5): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
src/cache/store.ts(57,10): error TS2339: Property 'expiresAt' does not exist on type 'CacheEntry'.
</error>
</errors>

<!-- Warnings: non-blocking but visible to LLM -->
<warnings>
<warning source="npm run lint" exit_code="1" severity="warn">
src/cache/store.ts:3:8 lint/unused-imports: Remove unused import 'CacheOptions'
</warning>
</warnings>

<!-- Only present after 3+ iterations on same task -->
<prior_attempts>
<attempt number="1">
Added TTL field to CacheEntry. Build failed: 'expiresAt' not in type.
</attempt>
<attempt number="2">
Updated CacheEntry type but used wrong field name. Build still fails.
</attempt>
</prior_attempts>
```

**Key formatting decisions** (from Anthropic's prompt engineering guidance):

1. **XML tags over markdown** — no collision with code content, attributes for metadata (`source=`, `exit_code=`, `index=`), unambiguous nesting.
2. **Errors as raw output** — preserve original compiler/test output format. Claude recognizes TypeScript errors, vitest failures, biome violations natively. Don't reformat, don't wrap in code blocks inside XML (redundant).
3. **Error truncation** — full output for compiler/linter errors (typically concise). For test/runtime output >200 lines: keep first 50 + last 50, summarize middle.
4. **Lessons in system prompt** — treated as persistent standing orders. Categorized by topic. Cap at 15-20 items. Most critical first and last (primacy/recency).
5. **Prior attempts after 3+ iterations** — prevents repeating the same broken fix. One-line summaries of what was tried and what happened.
6. **Section ordering** — system: `rules` > `lessons`. User: `task` > `progress` > `git_context` > `errors` > `prior_attempts`. Task first so Claude knows what it's doing before seeing context.

**Assembly logic**:

```typescript
function buildPrompt(
  config: DeloreanConfig,
  state: DeloreanState,
  task: Task,
  options: BuildOptions,
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const lessons = selectLessons(state.lessons, task, config.lessonStrategy);

  const systemPrompt = [
    buildRules(config),
    lessons.length > 0 ? buildLessonsXml(lessons) : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const userPrompt = [
    buildTaskXml(task, state.currentTask, state.tasks.length),
    buildProgressXml(state.tasks),
    options.gitContext ? buildGitContextXml(options.gitContext) : null,
    state.errors.length > 0 ? buildErrorsXml(state.errors) : null,
    state.iteration >= 3 ? buildPriorAttemptsXml(state) : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { systemPrompt, userPrompt };
}
```

**Dependencies**: Step 9 (lesson selection), Step 11 (context steps), Step 6 (state for errors)
**Test**:

- Build with errors → `<errors>` block present with raw output, `source` and `exit_code` attributes correct
- Build after errors cleared → no `<errors>` block
- Build with 5 lessons across 2 categories → `<lessons>` with `<category>` tags, correct ordering
- Build at iteration 1 → no `<prior_attempts>`. Build at iteration 4 → `<prior_attempts>` with 3 entries
- Build with no context (first iteration, first task) → only `<task>` and `<rules>` present
- Full assembly → verify XML is well-formed, section ordering matches spec
- Verify most-critical lesson appears first and last in category list
- Error truncation: 300-line error output → first 50 + "[... 200 lines truncated ...]" + last 50
  **Done when**: Prompts use XML tags throughout. Error feedback includes raw output with metadata. Lessons are categorized and ordered by criticality. Prior attempts summarized after 3+ iterations.

### Step 13: Budget manager + token tracking

**Files**: `packages/delorean/src/budget.ts`
**What**: `createBudgetManager(config.budget)` returns `{ track(usage), check(), summary(), estimatePromptCost(text) }`.

**Two tracking modes**:

1. **Actual cost tracking** (primary) — uses `usage` from CLI output:

   ```typescript
   // CLI JSON output includes: { usage: { input_tokens: 1234, output_tokens: 567 } }
   track({ input: 1234, output: 567, model: "claude-sonnet-4-6" });
   ```

2. **Pre-send estimation** (optional, for budget checks before invoking CLI):
   ```typescript
   // Rough estimate: ~4 characters per token for English text/code
   estimatePromptCost(promptText);
   // Returns estimated cost based on char count / 4 * model input price
   ```

**Pricing table** (built-in, overridable via config):

```typescript
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 5.0, output: 25.0 }, // per million tokens
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};
```

Note: Anthropic has a free `count_tokens` API endpoint (`/v1/messages/count_tokens`) for exact pre-send counting, but it requires an API key. Since the CLI adapter uses subscription billing (no API key), we use character-based estimation for pre-send and actual `usage` from output for tracking. Users with the SDK adapter get exact counts via the API.

**Budget enforcement**:

- `track(usage)` — accumulates cost per iteration and total
- `check()` → `{ ok, warning?, exceeded? }`. Warning at `warnAt` threshold. Exceeded at `maxCostPerRun` or `maxCostPerIteration`
- `summary()` → `{ totalCost, iterationCosts: Record<number, number>, remainingBudget, tokenTotals }`
- On `exceeded` → throws `BudgetExceededError` (caught by runner, triggers `interact` hook)

**Dependencies**: Step 2 (types)
**Test**:

- Track 5 iterations with Sonnet pricing → cost accumulates correctly (verify math)
- Track with Opus pricing → higher costs
- Hit `warnAt: 0.8` on $5 budget at $4.10 → warning flag set
- Hit `maxCostPerRun: 5` → exceeded
- Per-iteration limit: single $12 iteration on $10 limit → exceeded
- No budget config → never warns/exceeds, still tracks for summary
- `estimatePromptCost` for 4000-char prompt → roughly 1000 tokens → correct cost estimate
- Custom pricing override → uses custom prices
  **Done when**: Actual cost tracking from CLI `usage` is accurate. Pre-send estimation works as rough guide. Budget limits trigger at correct thresholds. Pricing table is current and overridable.

### Step 14: Interaction handler

**Files**: `packages/delorean/src/interact.ts`
**What**: Default terminal prompter using `readline`. `createInteractHandler()` returns `(question: string) => Promise<string>`. Config `interact` field overrides this (for programmatic use, testing, or custom UIs). Used by brainstorm phase (Q&A), budget exceeded, stop points.
**Dependencies**: Step 2 (types)
**Test**: Provide a mock `interact` that returns canned answers → verify brainstorm phase receives them. Default handler: integration test with piped stdin.
**Done when**: Terminal prompting works. Custom `interact` overrides default. Handles EOF/SIGINT gracefully.

### Step 15: Brainstorm phase runtime

**Files**: `packages/delorean/src/phases/brainstorm.ts`
**What**: Implements the `run` function for brainstorm phase. Uses `sessionStrategy: 'resume'` — each CLI invocation continues the same conversation via `--resume <session_id>`.

**CLI interaction loop**:

```
Invocation 1 (no --resume, new session):
  claude -p "Ask me one question at a time to build a spec for: {idea}" --output-format json
  → Response: { session_id: "abc-123", result: "What's the primary use case?" }
  → Capture session_id, extract question from result
  → Show question to user via interact handler
  → User answers: "Caching database queries"

Invocation 2 (--resume abc-123, continues conversation):
  claude -p "Caching database queries" --resume abc-123 --output-format json
  → Response: { session_id: "abc-123", result: "What cache invalidation strategy?" }
  → Extract question, show to user
  → User answers: "TTL-based, 5 minutes"

Invocation N (user says "done" or LLM signals completion):
  claude -p "done" --resume abc-123 --output-format json
  → LLM wraps up, writes qa.md via its tools
```

**Detailed flow**:

1. Interpolate `{idea}` into brainstorm prompt template
2. Invoke CLI adapter (no sessionId → fresh session)
3. Capture `session_id` from response → store in `state.sessions.brainstorm`
4. Extract question from response `result` text
5. Call `interact(question)` → get user's answer
6. Append Q&A pair to `state.qaHistory` and to `qa.md` on disk
7. Invoke CLI adapter again with user's answer as prompt + `--resume session_id`
8. Repeat from step 4 until:
   - User's answer contains "done" (configurable keyword)
   - LLM's response contains `completionPromise` signal
   - Max brainstorm iterations reached
9. Save final state

**Question extraction**: The LLM's `result` text contains both prose and a question. Extract the question by taking the last sentence ending in `?`. If no `?` found, treat entire result as the question.

**Dependencies**: Step 3 (LLM adapter — needs session support), Step 6 (state), Step 14 (interaction), Step 8 (logging)
**Test**:

- Mock adapter returns 3 responses with questions, then completion signal. Mock interact returns canned answers. Verify: `qa.md` contains all 3 Q&A pairs, `state.qaHistory` has 3 entries, `state.sessions.brainstorm` has session_id, adapter received `--resume` on calls 2+.
- User says "done" on question 2 → phase ends with 2 Q&A pairs, qa.md has 2 entries.
- Adapter error on invocation 3 → state saved with partial progress, resumable.
- Logger receives `human-input` events for each answer.
  **Done when**: Full Q&A loop works via sequential `claude -p` calls with `--resume`. qa.md and state stay in sync. Session ID persists for resume after crash.

### Step 16: Spec phase runtime

**Files**: `packages/delorean/src/phases/spec.ts`
**What**: Uses `sessionStrategy: 'resume'` — can optionally continue from brainstorm's session (same Claude context already has the Q&A in memory).

**Two modes**:

1. **Resuming from brainstorm session** (default if `state.sessions.brainstorm` exists):

   ```
   claude -p "Now generate a detailed spec from our conversation. Save it as spec.md" \
     --resume $brainstorm_session_id --output-format json --allowedTools Read,Edit,Write
   ```

   Claude already has the full brainstorm context — no need to re-read qa.md.

2. **Fresh start** (no brainstorm session, e.g., user provided qa.md directly):
   ```
   claude -p "Generate a spec from qa.md. Save it as spec.md" \
     --output-format json --allowedTools Read,Edit,Write
   ```
   Claude reads qa.md from disk since it has no prior context.

Triggers stop point for user approval after spec.md is written.
**Dependencies**: Step 3 (LLM — needs session support), Step 6 (state), Step 8 (logging)
**Test**:

- With brainstorm session → adapter called with `--resume brainstorm_session_id`, spec.md written.
- Without brainstorm session → adapter called without `--resume`, reads qa.md, spec.md written.
- Missing qa.md and no brainstorm session → descriptive error.
- Stop point fires after spec.md creation.
  **Done when**: Both modes produce spec.md. Session chaining from brainstorm works.

### Step 17: Plan phase runtime

**Files**: `packages/delorean/src/phases/plan.ts`
**What**: Uses `sessionStrategy: 'resume'` — can continue from spec session. Uses `--json-schema` for structured task output so we don't need fragile regex parsing.

**Structured output approach**:

```typescript
const taskArraySchema = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          prompt: { type: "string" },
          dependsOn: { type: "array", items: { type: "string" } },
        },
        required: ["id", "title", "prompt"],
      },
    },
  },
  required: ["tasks"],
};
```

**CLI invocation**:

```
claude -p "Break the spec into ordered, test-driven implementation tasks..." \
  --resume $spec_session_id \
  --output-format json \
  --json-schema '{"type":"object","properties":{"tasks":...}}' \
  --allowedTools Read,Edit,Write
```

**Response parsing**:

```typescript
const output = JSON.parse(stdout);
// output.result              → human-readable plan text → write to plan.md
// output.structured_output   → { tasks: [...] } validated against schema
// output.session_id          → store in state.sessions.plan
const tasks: Task[] = output.structured_output.tasks;
```

Claude writes `plan.md` (human-readable) via its tools AND returns structured task data via `--json-schema`. We get both: a readable plan file and a machine-parseable task list without regex.

**Fallback**: If `--json-schema` fails (older CLI version?), fall back to regex parsing: scan for `## Task N:` headers or numbered sections. Treat entire plan as one task if no structure found (with warning).

Triggers stop point for user approval.
**Dependencies**: Step 3 (LLM — needs `--json-schema` support), Step 6 (state), Step 8 (logging)
**Test**:

- With spec session → adapter called with `--resume spec_session_id` and `--json-schema`, returns `structured_output` with 5 tasks → state.tasks has 5 entries with correct prompts.
- Without spec session → reads spec.md, same structured output.
- `structured_output` null (schema not supported) → falls back to regex parsing, warning logged.
- Unstructured plan → single task with warning.
- Missing spec.md and no spec session → error.
- plan.md written with readable content. Stop point fires.
  **Done when**: Tasks extracted via structured output (primary) or regex (fallback). plan.md and state.tasks both populated.

### Step 18: Execute phase runtime (the main loop)

**Files**: `packages/delorean/src/phases/execute.ts`
**What**: The core Ralph Wiggum loop. Uses `sessionStrategy: 'fresh'` — every iteration is a new CLI invocation with no `--resume`. The filesystem carries state between iterations; the lesson system and prompt builder bridge the context gap.

**Why fresh context**: Each iteration starts with a clean Claude session. This prevents context window bloat across many iterations and avoids the LLM getting "stuck" in a bad reasoning path. Instead, lessons learned and error output are selectively injected into the next prompt.

**Per-iteration CLI invocation**:

```
claude -p "{assembled prompt with task + lessons + errors + context}" \
  --output-format stream-json \
  --allowedTools Read,Edit,Bash \
  --max-turns 10 \
  --model sonnet \
  --append-system-prompt "When you learn something useful, output: LESSON: [category] description"
  # No --resume flag — fresh session every time
```

**Full iteration cycle**:

1. Run `before` steps: `contextGather()` → situation report, `gitContext()` → recent git history
2. Build prompt via `buildPrompt()`:
   - Git context (log, diff stat)
   - Task context (index, completed summaries)
   - Error block (error-severity hook failures from last attempt, with full stdout/stderr)
   - Lessons block (selected via strategy — recent, token-budget, or digest)
   - Task prompt (the actual work to do)
   - Completion signal instruction
3. Invoke CLI adapter with `stream-json` — parse events as they arrive:
   - `assistant` events → log to markdown, scan for `LESSON:` patterns in real-time
   - `tool_use`/`tool_result` events → log tool activity
   - `result` event → capture final text, session_id (not stored — fresh context), usage
4. Parse lessons from accumulated response text
5. Check for completion signal in response
6. Run `after` hooks — each returns `{ ok, output }`, checked by severity
7. **All pass** → run `on-success` steps (git commit) → mark task done → advance
8. **Any error hook fails** → capture in `state.errors` (hook id + exit code + last 200 lines) → run `on-failure` hooks (rollback if regression) → retry same task. Warn hook failures go to `state.warnings` instead.
9. Track token usage → feed to budget manager
10. Check budget limits — exceeded → invoke `interact` hook
11. Check max iterations — exceeded → pause with error
12. Save state to `delorean-state.json` (crash recovery)

**Dependencies**: Step 3 (LLM), Step 6 (state), Step 8 (logging), Step 9 (lessons), Step 10 (hooks), Step 12 (prompt builder), Step 13 (budget), Step 20 (hook runner)
**Test**:

- Happy path: 3 tasks, all pass first try → 3 CLI invocations (no `--resume`), 3 commits, state shows completed
- Retry path: task 2 fails build → `state.errors` populated → next invocation's prompt contains error block → passes → errors cleared → advances
- Lesson flow: iteration 1 response contains `LESSON: [perf] batch inserts` → stored in state → iteration 2 prompt includes it
- Max iterations: task always fails → hits limit → state shows `status: 'failed'` with last errors
- Budget exceeded: mock adapter reports high token usage → budget check triggers → interact called
- Crash recovery: state saved after iteration 2, process killed → restart → `detectEntryPhase` finds state → resumes from task 2, iteration 3
- Streaming: adapter yields events in real-time → lessons parsed mid-stream → markdown log updated live
  **Done when**: Full loop executes via fresh CLI invocations. Errors feed back into `<errors>`, warnings into `<warnings>`. Lessons accumulate and enter prompts. State persists for crash recovery. Budget enforced. Severity levels control blocking behavior.

### Step 19: Review phase runtime

**Files**: `packages/delorean/src/phases/review.ts`
**What**: LLM reviews all changes made during execute phase. Prompt includes: original spec, git diff from session start, list of completed tasks. LLM can flag issues. If issues found, can trigger fix iterations (re-enter execute for specific tasks). Runs hooks one final time. Custom stop point tasks pause for human review.
**Dependencies**: Step 3 (LLM), Step 6 (state), Step 10 (hooks)
**Test**: Mock LLM approves → phase passes. Mock LLM flags issue → verify fix iteration triggered. Final gate hooks fail → review fails with clear output.
**Done when**: Review validates changes. Issues trigger fix loops. Final gates run.

### Step 20: Hook runner (phase runner integration)

**Files**: `packages/delorean/src/hooks/runner.ts`
**What**: The hook runner resolves and executes hooks for each iteration within a phase. This is the runtime that makes the unified hook model work.

**Resolution**: `resolveHooks(config.hooks, phase.hooks)` merges config-level and phase-level hooks. Same `id` → phase wins. `hooks: []` on phase → no hooks. `hooks: undefined` → inherit all from config.

**Execution order**:

1. Collect hooks by `when` value
2. Run `before` hooks (parallel or sequential, configurable)
3. Yield control for LLM invocation (caller handles this)
4. Run `after` hooks sequentially — check severity on failure:
   - `severity: 'error'` + `ok: false` → mark iteration as failed, collect error output for `<errors>` block
   - `severity: 'warn'` + `ok: false` → collect output for `<warnings>` block, does NOT block
   - `severity: 'info'` + `ok: false` → logged only, not fed to prompt
   - Any severity + `ok: true` → continue
5. If all `error`-severity hooks passed → run `on-success` hooks
6. If any `error`-severity hook failed → run `on-failure` hooks (warnings alone don't trigger failure)
7. Run `before-phase` / `after-phase` hooks at phase boundaries

**Error handling**:

- `warn`/`info` hook throws → logged, pipeline continues.
- `error` hook throws (not just returns `passed: false`) → treated as failure, error captured.
- Hook timeout → killed after `timeoutPerIteration`, treated as failure.

**Dependencies**: Step 2 (types), Step 4 (hook factories), Step 8 (logging)
**Test**:

- Resolve: config has `[build, test]`, phase has `[build({command:'tsc'})]` → resolved has phase's build + config's test.
- Resolve: phase has `hooks: []` → resolved is empty.
- Execution order: register hooks with various `when` values → verify execution order matches spec.
- Error failure: `after` hook with `severity: 'error'` returns `{ ok: false }` → `on-failure` hooks run, `on-success` skipped.
- Warn failure: `severity: 'warn'` returns `{ ok: false }` → output collected for `<warnings>` block, does NOT trigger failure.
- All errors pass: → `on-success` hooks run.
- Info/warn hook throws: logged, pipeline continues.
- Custom hook with `run` function → receives correct `HookContext`.
- Custom hook with `command` → shell runner executes it.
- `before-phase` / `after-phase` hooks fire at correct boundaries.
  **Done when**: Hook resolution merges correctly. Execution order is deterministic. Severity-based blocking works. Warnings collected separately from errors. Custom hooks integrate seamlessly.

### Step 21: CLI

**Files**: `packages/delorean/src/cli.ts`
**What**: Entry point. Parses args:

- Positional: inline idea string
- `--idea <string>` — explicit idea
- `--from <phaseId>` — force start phase
- `--resume` — force resume from state
- `--max-iterations <n>` — override
- `--model <string>` — override
- `--dry-run` — preview phases, tasks, hooks without invoking LLM
- `--config <path>` — custom config file path

Flow:

1. Parse args
2. Load config (merge CLI overrides)
3. Detect entry phase (smart resume or `--from`)
4. If `--dry-run`: print phase plan and exit
5. Run pipeline: iterate phases from entry point
6. Between phases: stop points, state saves
7. On completion: final summary (total cost, iterations, tasks completed)

`bin` field in package.json points to compiled CLI.
**Dependencies**: Step 5 (config), Step 7 (resume), everything else for runtime
**Test**: `--dry-run` with various configs → verify output lists correct phases. `--from plan` → verify pipeline starts at plan. Positional arg → verify idea passed to brainstorm. Missing config file → descriptive error. `--help` → shows usage.
**Done when**: All CLI flags work. Dry-run produces correct preview. Pipeline runs end-to-end from CLI.

### Step 22: Public API + index exports

**Files**: `packages/delorean/src/index.ts`
**What**: Export the complete public surface:

```typescript
export { defineConfig } from './config';
export { phases } from './phases';
export { hooks } from './hooks';
export { steps } from './steps';
export { createClaudeCliAdapter } from './llm/claude-cli';
export { createClaudeSdkAdapter } from './llm/claude-sdk';
export { createMockAdapter } from './llm/mock-adapter';
export type { DeloreanConfig, Phase, Hook, HookResult, LLMAdapter, MockAdapter, ... } from './types';
```

Verify no internal implementation details leak. Tree-shakeable — each export independently importable.
**Dependencies**: All previous steps
**Test**: Import each export in isolation → verify it works. `defineConfig` with imported factories → produces valid config. Type-only imports compile without runtime code.
**Done when**: Clean public API. No internal leaks. All named exports documented in JSDoc.

## Verification scenarios

### V1: Smart resume with existing artifacts

**Setup**: Create temp directory with `spec.md` present, no other artifacts.
**Run**: `npx delorean` (no args)
**Expected**: Delorean detects spec.md, skips brainstorm and spec phases, starts from plan phase. Console output: "Found spec.md, resuming from plan phase."
**Verify**: Plan phase receives spec.md content. No brainstorm or spec invocations logged.

### V2: Full pipeline from inline idea

**Setup**: Empty working directory with `delorean.config.ts` using all defaults.
**Run**: `npx delorean "build a cache layer for database queries"`
**Expected**: Brainstorm → Q&A loop → qa.md → Spec → spec.md → Plan → plan.md + tasks → Execute → loop through tasks → Review → done.
**Verify**: All artifacts created. State shows `status: 'completed'`. JSONL log contains events for every phase transition. Git log shows commits for each successful task.

### V3: Factory overrides apply correctly

**Config**:

```typescript
defineConfig({
  phases: [phases.execute({ allowedTools: ["Read", "Edit", "Bash"] })],
  hooks: [
    hooks.build({ command: "npx tsc --noEmit" }),
    hooks.test({ command: "npm run test:unit -- --reporter=verbose" }),
  ],
});
```

**Verify**: Execute phase LLM invocation receives `allowedTools: ['Read', 'Edit', 'Bash']`. Build hook runs `npx tsc --noEmit` (not `npm run build`). Test hook runs the custom command.

### V4: Error feedback loop

**Setup**: Task that writes TypeScript with a deliberate type error.
**Iteration 1**: LLM writes code → `npx tsc --noEmit` fails → error captured in state.
**Iteration 2**: Prompt contains "## Errors from previous attempt\n### build (exit code 1)\n{tsc error output}". LLM fixes the type error → build passes → task advances.
**Verify**: `state.errors` populated after iteration 1, cleared after iteration 2. Prompt builder output contains exact error text in `<errors>` XML block. JSONL log shows `error-captured` then `hook-result: ok`.

### V5: Lesson accumulation across iterations

**Setup**: Execute phase with 5 tasks.
**Run**: Each task's LLM output includes `LESSON: [performance] use batch inserts for bulk data`.
**Verify**: After 5 tasks, `state.lessons` has 5 entries. `tokenBudget` strategy selects relevant subset. Prompt for task 5 contains lessons from earlier tasks. JSONL log has 5 `lesson-learned` events.

### V6: Budget enforcement

**Config**: `budget: { maxCostPerRun: 5.00, warnAt: 0.8 }`
**Run**: Mock adapter reports $1.20 per iteration.
**Verify**: After iteration 3 ($3.60) → warning logged. After iteration 4 ($4.80) → `interact` called: "Budget 96% consumed ($4.80 / $5.00). Continue?". User says yes → iteration 5 exceeds → `interact` called again.

### V7: Git auto-commit + rollback on regression

**Setup**: Test repo with 10 passing tests.
**Iteration 1**: LLM adds feature + test (11 tests) → hooks pass → auto-commit.
**Iteration 2**: LLM refactors, accidentally deletes a test (10 tests) → `noTestRegression` fails → `gitRollback` fires → changes discarded → error fed back.
**Iteration 3**: LLM re-does refactor, keeps all tests (11 tests) → passes → commit.
**Verify**: Git log shows commit from iteration 1, no commit from iteration 2, commit from iteration 3. State tracks test count. Rollback left working tree clean.

### V8: Custom phase with `run` function

**Config**:

```typescript
defineConfig({
  phases: [
    {
      id: "seed-data",
      needs: ["spec.md"],
      run: async (ctx) => {
        await generateSeedData(ctx.artifacts["spec.md"]);
        return { success: true };
      },
    },
    phases.execute(),
  ],
});
```

**Verify**: Custom phase runs before execute. Receives `spec.md` content via `ctx.artifacts`. Execute phase runs after. Phase transition logged.

### V9: Hooks lifecycle

**Config**:

```typescript
defineConfig({
  hooks: {
    beforePhase: async (ctx, phase) => {
      log.push(`before:${phase.id}`);
    },
    afterPhase: async (ctx, phase) => {
      log.push(`after:${phase.id}`);
    },
    beforeIteration: async (ctx) => {
      log.push(`before-iter:${ctx.state.iteration}`);
    },
    afterIteration: async (ctx, result) => {
      log.push(`after-iter:${result.passed}`);
    },
  },
});
```

**Run**: Pipeline with plan + execute (2 tasks, 1 retry).
**Expected order**: `before:plan`, `after:plan`, `before:execute`, `before-iter:0`, `after-iter:false`, `before-iter:1`, `after-iter:true`, `before-iter:2`, `after-iter:true`, `after:execute`.

### V10: Dry-run preview

**Run**: `npx delorean --dry-run` with full default config.
**Expected output**:

```
Delorean — dry run

Phases:
  1. brainstorm → qa.md
  2. spec → spec.md (needs: qa.md)
  3. plan → plan.md (needs: spec.md)
  4. execute (needs: plan.md)
  5. review

Hooks:
  - build (error): npm run build
  - lint (error): npm run lint
  - test (error): npm run test
  - no-test-regression (error)
  - diff-size-check (error)
  - git-context (info): before
  - git-commit (info): on-success

No LLM invocations. Exiting.
```

**Verify**: No LLM calls made. No state file created. No logs written. Exit code 0.
