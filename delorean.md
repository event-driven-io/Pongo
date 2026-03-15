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
│   ├── index.ts                       # Public API: defineConfig, phases, hooks
│   ├── cli.ts                         # CLI entry point
│   ├── types.ts                       # All type definitions
│   ├── types.unit.spec.ts             # Type usability tests
│   ├── config.ts                      # Config loading (delorean.config.ts)
│   ├── config.unit.spec.ts
│   ├── state.ts                       # JSON state management
│   ├── state.unit.spec.ts
│   ├── prompt-builder.ts              # Assembles iteration prompts w/ errors + lessons
│   ├── prompt-builder.unit.spec.ts
│   ├── resume.ts                      # Smart resume: scan for artifacts, detect entry point
│   ├── resume.unit.spec.ts
│   ├── budget.ts                      # Cost/token tracking and budget enforcement
│   ├── budget.unit.spec.ts
│   ├── interact.ts                    # Terminal interaction handler
│   ├── interact.unit.spec.ts
│   ├── phases/
│   │   ├── index.ts                   # Factory functions: brainstorm(), spec(), plan(), execute(), review()
│   │   ├── index.unit.spec.ts         # Phase factory tests
│   │   ├── brainstorm.ts              # Q&A phase → qa.md
│   │   ├── brainstorm.int.spec.ts
│   │   ├── spec.ts                    # Generate spec → spec.md
│   │   ├── spec.int.spec.ts
│   │   ├── plan.ts                    # Generate plan → plan.md
│   │   ├── plan.int.spec.ts
│   │   ├── execute.ts                 # Loop execution
│   │   ├── execute.int.spec.ts
│   │   ├── review.ts                  # Review phase — validates output quality
│   │   └── review.int.spec.ts
│   ├── hooks/
│   │   ├── index.ts                   # Factory functions: build(), test(), gitCommit(), etc.
│   │   ├── index.unit.spec.ts         # Hook factory tests
│   │   ├── runner.ts                  # Hook resolution + execution engine
│   │   ├── runner.unit.spec.ts
│   │   ├── shell.ts                   # Shell command runner (build, lint, test hooks)
│   │   ├── shell.unit.spec.ts
│   │   ├── git-commit.ts              # Auto-commit after error-severity hooks pass
│   │   ├── git-context.ts             # Gather git log/diff for prompt preamble
│   │   ├── git-rollback.ts            # Reset to last good commit on regression
│   │   ├── git.int.spec.ts            # Integration tests for git hooks (needs real repo)
│   │   ├── context-gather.ts          # Assemble situation report
│   │   ├── drift.ts                   # Test regression + diff size checks
│   │   └── drift.unit.spec.ts
│   ├── llm/
│   │   ├── types.ts                   # LLM adapter interface
│   │   ├── claude-cli.ts              # Default: spawns `claude` CLI (Pro subscription)
│   │   ├── claude-cli.unit.spec.ts
│   │   ├── claude-sdk.ts              # Optional: @anthropic-ai/claude-agent-sdk
│   │   ├── mock-adapter.ts            # Scriptable mock for testing
│   │   └── mock-adapter.unit.spec.ts
│   ├── lessons/
│   │   ├── types.ts                   # Lesson strategy interface
│   │   ├── strategies.ts              # Built-in strategies (recent, budget, digest)
│   │   ├── store.ts                   # Lesson storage + retrieval
│   │   └── store.unit.spec.ts
│   ├── logging/
│   │   ├── jsonl.ts                   # Machine-readable JSONL logger
│   │   ├── markdown.ts                # Human-readable markdown session log
│   │   └── logging.unit.spec.ts
│   ├── prompts/
│   │   ├── brainstorm.ts              # Default brainstorm prompt template
│   │   ├── plan.ts                    # Default plan prompt template
│   │   └── execute.ts                 # Default execute prompt template
│   ├── testing/                       # Test infrastructure (exported for users too)
│   │   ├── fixture.ts                 # createFixture() — temp dir, config, state, git repo
│   │   ├── fixture.unit.spec.ts
│   │   └── scenarios.ts               # Canned LLM response scripts for common flows
│   ├── cli.e2e.spec.ts                # CLI flags, dry-run, full pipeline e2e tests
│   └── public-api.unit.spec.ts        # Validates exported surface
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsup.config.ts
└── vitest.config.ts
```

Tests live alongside source files (colocated), following Dumbo's convention.

## Testing strategy

**TDD throughout**: Every implementation step writes tests first, runs them to see them fail, then implements until green. Tests use vitest with `describe`/`it` syntax and `node:assert` (not vitest's `expect`). File naming follows Pongo convention: `.unit.spec.ts`, `.int.spec.ts`, `.e2e.spec.ts`. Tests are **colocated** — spec files live next to the source they test (like Dumbo), not in a separate `test/` directory.

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
import { createFixture } from "../testing/fixture";

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
import { scenarios } from "../testing/scenarios";

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

**Unit tests** (`*.unit.spec.ts`) — test individual functions with mock adapter, no filesystem:

- `buildPrompt()` with various state combinations
- Lesson selection strategies
- Budget calculations
- Config validation
- Resume detection logic

**Integration tests** (`*.int.spec.ts`) — test phase runtimes with mock adapter + real filesystem (temp dirs):

- Brainstorm Q&A loop: mock adapter returns questions, mock interact returns answers → verify qa.md written
- Execute loop: mock adapter + real hooks (`echo ok` / `exit 1`) → verify error feedback, lesson accumulation, state progression
- Session resume: mock adapter tracks `sessionId` in options → verify `--resume` passed on subsequent calls
- Hook feedback: error hook fails → verify error text appears in next iteration's prompt
- Crash recovery: write state mid-run → call phase runner with that state → verify it picks up where it left off

**E2E tests** (`*.e2e.spec.ts`) — spawn `npx delorean` as a child process against a fixture directory with a mock adapter config:

- `--dry-run` → verify output lists phases and hooks, no adapter calls
- `--from execute` → verify pipeline starts at execute
- `"build a thing"` positional arg → verify brainstorm phase receives idea
- Full pipeline with mock adapter → verify all artifacts created, state completed

### Test conventions

All tests use `describe`/`it` from vitest and `assert` from `node:assert`:

```typescript
import assert from "node:assert";
import { describe, it, beforeAll, afterAll } from "vitest";

describe("FeatureName", () => {
  describe("methodOrBehavior", () => {
    it("describes expected outcome", () => {
      const result = functionUnderTest(input);
      assert.strictEqual(result, expected);
    });
  });
});
```

### E2E test pattern

```typescript
import assert from "node:assert";
import { describe, it, afterAll } from "vitest";

describe("CLI", () => {
  describe("--dry-run", () => {
    it("lists phases without invoking adapter", async () => {
      const fixture = await createFixture({
        config: { adapter: createMockAdapter({ responses: [] }) },
      });

      const result = await spawn("npx", ["delorean", "--dry-run"], {
        cwd: fixture.cwd,
      });

      assert.ok(result.stdout.includes("brainstorm → qa.md"));
      assert.ok(result.stdout.includes("execute"));
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(fixture.adapter.callCount, 0);

      await fixture.cleanup();
    });
  });

  describe("execute retry", () => {
    it("retries on error-severity hook failure", async () => {
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
        state: {
          tasks: [{ id: "1", title: "Cache", prompt: "Implement cache" }],
        },
        git: true,
      });

      await spawn("npx", ["delorean"], { cwd: fixture.cwd });

      assert.strictEqual(adapter.callCount, 2);
      assert.ok(
        adapter.calls[1].prompt.includes("Errors from previous attempt"),
      );
      const state = await fixture.readState();
      assert.strictEqual(state.status, "completed");

      await fixture.cleanup();
    });
  });
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
    return { ok: true };
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

## Implementation phases

**Vertical slices**: Each phase delivers a working, testable piece. You can demo and use the result of each phase before moving to the next. No building layers in isolation.

**TDD process for every step within each phase**: (1) Write test file with `describe`/`it` structure using vitest + `node:assert`. (2) Run tests — confirm they fail. (3) Implement the minimum code to pass. (4) Refactor while green. Tests use Pongo conventions: `.unit.spec.ts`, `.int.spec.ts`, `.e2e.spec.ts`. Tests are **colocated** next to the source files they test (e.g., `src/budget.ts` → `src/budget.unit.spec.ts`).

---

### Phase 1: Minimal working loop — execute from a ready-made plan

**Goal**: Given a hand-written `plan.md` with tasks, loop through them calling `claude -p` and run a shell command (e.g., `npm run build`) after each. If the command fails, feed the error output back into the next prompt and retry. State persists to `delorean-state.json` so you can kill the process and resume.

**This is the core of Delorean.** Everything else builds on top.

**What you can do after this phase**: Write a `plan.md` by hand, run `npx delorean`, and watch it execute tasks one by one with build verification.

#### Step 1.1: Scaffold package

**Files**: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsup.config.ts`, `vitest.config.ts`, `src/index.ts`

Create the workspace package mirroring Dumbo's setup. Register in `src/package.json` workspaces.

```jsonc
// packages/delorean/package.json
{
  "name": "@pongo/delorean",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "tsup",
    "build:ts": "tsc -b",
    "test": "run-s test:unit test:int test:e2e",
    "test:unit": "vitest run \".unit.spec\"",
    "test:int": "vitest run \".int.spec\"",
    "test:e2e": "vitest run \".e2e.spec\"",
    "test:watch": "vitest",
  },
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs",
      },
    },
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
}
```

`tsconfig.json` extends `../../tsconfig.shared.json` (composite, outDir, rootDir). `tsconfig.build.json` disables composite for tsup. `vitest.config.ts` imports `../../vitest.shared`. `tsup.config.ts` mirrors Dumbo.

**Done when**: `npm install` succeeds, `tsc --noEmit` passes, `vitest run` passes (zero tests).

#### Step 1.2: Minimal types + CLI adapter + mock adapter

**Files**: `src/types.ts`, `src/llm/types.ts`, `src/llm/claude-cli.ts`, `src/llm/claude-cli.unit.spec.ts`, `src/llm/mock-adapter.ts`, `src/llm/mock-adapter.unit.spec.ts`

**Types to define** (minimal — just what the loop needs):

```typescript
// src/types.ts
type Task = {
  id: string;
  title: string;
  prompt: string;
  status?: "pending" | "done" | "failed";
};
type HookResult = {
  ok: boolean;
  output?: string;
  data?: Record<string, unknown>;
};

// src/llm/types.ts
type LLMMessage = {
  role: "assistant" | "system";
  content: string;
  tokenUsage?: { input: number; output: number };
  sessionId?: string;
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
  appendSystemPrompt?: string;
  sessionId?: string;
  effort?: "low" | "medium" | "high";
};
```

No `Phase`, `DeloreanConfig`, `Lesson`, `Hook` types yet — those come in Phase 2-4.

**CLI adapter** — `createClaudeCliAdapter(options?)`. Implement per the "CLI adapter" design section above. Must handle both output formats:

- `stream-json`: NDJSON line-by-line parsing — route by `event.type` (`system`→session_id, `assistant`→yield content, `result`→yield with usage)
- `json`: single `JSON.parse(stdout)` — extract `result`, `session_id`, `usage`
- Flag assembly: `--resume`, `--allowedTools`, `--model`, `--max-turns`, `--append-system-prompt`, `--effort`
- Error handling: non-zero exit → `CliAdapterError`, timeout → `SIGTERM` then `SIGKILL`, malformed lines → log + skip

**Mock adapter** — `createMockAdapter(config)`:

```typescript
type MockAdapterConfig = {
  responses?: Array<{
    result: string;
    sessionId?: string;
    usage?: { input: number; output: number };
  }>;
  handler?: (
    prompt: string,
    options: LLMInvokeOptions,
  ) => { result: string; sessionId?: string };
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

```typescript
// src/llm/claude-cli.unit.spec.ts — TDD tests
describe("createClaudeCliAdapter", () => {
  describe("stream-json parsing", () => {
    it("yields LLMMessage from assistant events", async () => {
      /* ... */
    });
    it("captures session_id from init event", async () => {
      /* ... */
    });
    it("yields token usage from result event", async () => {
      /* ... */
    });
    it("skips malformed JSON lines without crashing", async () => {
      /* ... */
    });
  });
  describe("json parsing", () => {
    it("yields single LLMMessage from buffered output", async () => {
      /* ... */
    });
  });
  describe("CLI flag assembly", () => {
    it("passes --resume when sessionId provided", async () => {
      /* ... */
    });
    it("omits --resume when no sessionId", async () => {
      /* ... */
    });
    it("passes --allowedTools as comma-separated list", async () => {
      /* ... */
    });
  });
  describe("error handling", () => {
    it("throws CliAdapterError on non-zero exit", async () => {
      /* ... */
    });
    it("kills process after timeout", async () => {
      /* ... */
    });
  });
});

// src/llm/mock-adapter.unit.spec.ts — TDD tests
describe("createMockAdapter", () => {
  describe("responses mode", () => {
    it("yields responses in order", async () => {
      /* ... */
    });
    it("throws when responses exhausted", async () => {
      /* ... */
    });
    it("tracks each call in calls array", async () => {
      /* ... */
    });
  });
  describe("handler mode", () => {
    it("passes prompt and options to handler", async () => {
      /* ... */
    });
  });
  describe("assertions", () => {
    it("assertCalledWith passes on matching options", async () => {
      /* ... */
    });
    it("assertPromptContains checks specific call index", async () => {
      /* ... */
    });
  });
  describe("reset", () => {
    it("clears call history", async () => {
      /* ... */
    });
  });
});
```

**Done when**: Mock adapter works for testing. CLI adapter parses both `json` and `stream-json` formats. Session IDs captured and re-passed. Timeouts and errors handled.

#### Step 1.3: State manager

**Files**: `src/state.ts`, `src/state.unit.spec.ts`

`loadState(cwd)` reads `delorean-state.json` or returns `null`. `saveState(cwd, state)` writes atomically (`.tmp` then rename). `createInitialState(tasks)` returns a fresh state.

State shape (minimal for Phase 1 — grows in later phases):

```typescript
// Phase 1: just what the execute loop needs
type DeloreanState = {
  status: "idle" | "running" | "paused" | "completed" | "failed";
  currentTask: number;
  iteration: number;
  tasks: Task[];
  errors: Array<{ source: string; exitCode: number; output: string }>;
};

// Phase 4 adds: lessons: Lesson[], lessonDigest: string | null
// Phase 5 adds: currentPhase: string, sessions: Record<string, string>,
//               qaHistory: Array<{ question: string; answer: string }>,
//               cost: { total: number; perIteration: Record<number, number> }
```

```typescript
// src/state.unit.spec.ts — TDD tests
describe("State manager", () => {
  it("round-trips state through JSON", async () => {
    /* ... */
  });
  it("writes atomically", async () => {
    /* ... */
  });
  it("returns null when file missing", async () => {
    /* ... */
  });
});
```

**Done when**: State round-trips. Atomic writes work. Missing file returns null.

#### Step 1.4: Shell hook runner

**Files**: `src/hooks/shell.ts`, `src/hooks/shell.unit.spec.ts`

`runShellCommand(command, cwd)` — executes a shell command, captures stdout+stderr (last 200 lines), returns `{ ok: exitCode === 0, output }`.

```typescript
// src/hooks/shell.unit.spec.ts — TDD tests
describe("runShellCommand", () => {
  it("returns ok: true for exit code 0", async () => {
    /* ... */
  });
  it("returns ok: false for non-zero exit", async () => {
    /* ... */
  });
  it("captures stdout and stderr", async () => {
    /* ... */
  });
  it("truncates output beyond 200 lines", async () => {
    /* ... */
  });
});
```

**Done when**: Shell commands run and return structured results.

#### Step 1.5: Prompt builder (minimal)

**Files**: `src/prompt-builder.ts`, `src/prompt-builder.unit.spec.ts`

Minimal version: assembles `<task>` XML with the current task prompt + `<errors>` block if previous iteration failed. No lessons, no git context, no progress tracking yet.

```typescript
// src/prompt-builder.unit.spec.ts — TDD tests
describe("buildPrompt", () => {
  it("includes <task> with the prompt text", () => {
    /* ... */
  });
  it("includes <errors> when errors present", () => {
    /* ... */
  });
  it("omits <errors> when no errors", () => {
    /* ... */
  });
  it("preserves raw error output", () => {
    /* ... */
  });
});
```

**Done when**: Prompts contain the task and error feedback.

#### Step 1.6: Execute loop + CLI entry point

**Files**: `src/phases/execute.ts`, `src/phases/execute.int.spec.ts`, `src/cli.ts`

The core loop: read `plan.md`, parse tasks (regex: `## Task N:` headers), iterate through them. For each task: build prompt → invoke adapter → run shell hook → if ok, advance; if not, feed error back and retry. Save state after each iteration. Resume from `delorean-state.json` if present.

CLI: `npx delorean` — reads plan.md, runs the loop. `npx delorean --dry-run` — lists parsed tasks without invoking LLM.

```typescript
// src/phases/execute.int.spec.ts — TDD tests (uses mock adapter + temp dir)
describe("Execute loop", () => {
  it("completes 3 tasks with 3 adapter calls", async () => {
    /* ... */
  });
  it("retries on shell command failure with error in prompt", async () => {
    /* ... */
  });
  it("saves state after each iteration", async () => {
    /* ... */
  });
  it("resumes from saved state", async () => {
    /* ... */
  });
  it("fails after max iterations", async () => {
    /* ... */
  });
});
```

**Done when**: You can write a `plan.md`, run `npx delorean`, and it executes tasks with build checks and error retry. State persists for crash recovery.

---

### Phase 2: Hooks system — configurable verification gates

**Goal**: Replace the hardcoded shell command with the full hook system. Multiple hooks per iteration, severity levels, before/after/on-success/on-failure lifecycle.

**What you can do after this phase**: Configure `build`, `test`, `lint` hooks. Warnings show up in prompts without blocking. Failed error-hooks block and retry. Git auto-commit on success.

#### Step 2.1: Hook types and factories

**Files**: `src/types.ts` (extend), `src/hooks/index.ts`, `src/hooks/index.unit.spec.ts`

**Types to add**:

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
  severity?: "error" | "warn" | "info"; // default: 'error'
  command?: string;
  run?: (ctx: HookContext) => Promise<HookResult>;
};
type HookContext = {
  config: DeloreanConfig;
  state: DeloreanState;
  phase: Phase;
  task?: Task;
  iteration: number;
  cwd: string;
  logger: Logger;
};
type HookError = {
  hookId: string;
  source: string;
  exitCode: number;
  output: string;
  severity: string;
};
```

**Factory functions** — each returns a plain `Hook` object, overridable via `Partial<Hook>`:

- `hooks.build(overrides?)` → `{ id: 'build', when: 'after', severity: 'error', command: 'npm run build' }`
- `hooks.lint(overrides?)` → `{ id: 'lint', when: 'after', severity: 'error', command: 'npm run lint' }`
- `hooks.test(overrides?)` → `{ id: 'test', when: 'after', severity: 'error', command: 'npm run test' }`
- `hooks.noTestRegression(overrides?)` → `{ id: 'no-test-regression', when: 'after', severity: 'error', run: ... }`
- `hooks.diffSizeCheck(overrides?)` → `{ id: 'diff-size-check', when: 'after', severity: 'error', run: ... }`
- `hooks.gitContext(overrides?)` → `{ id: 'git-context', when: 'before', run: ... }`
- `hooks.gitCommit(overrides?)` → `{ id: 'git-commit', when: 'on-success', run: ... }`
- `hooks.gitRollback(overrides?)` → `{ id: 'git-rollback', when: 'on-failure', run: ... }`
- `hooks.contextGather(overrides?)` → `{ id: 'context-gather', when: 'before', run: ... }`

```typescript
// src/hooks/index.unit.spec.ts — TDD tests
describe("Hook factories", () => {
  describe("build", () => {
    it("defaults to error severity", () => {
      /* ... */
    });
    it("uses npm run build as default command", () => {
      /* ... */
    });
    it("merges overrides preserving defaults", () => {
      // hooks.build({ command: 'npx tsc' }) → severity still 'error'
    });
  });
  describe("test", () => {
    it("defaults to error severity, npm run test", () => {
      /* ... */
    });
  });
  describe("gitCommit", () => {
    it("runs on-success", () => {
      /* ... */
    });
  });
  describe("gitContext", () => {
    it("runs before", () => {
      /* ... */
    });
  });
});
```

#### Step 2.2: Hook runner — resolution + execution engine

**Files**: `src/hooks/runner.ts`, `src/hooks/runner.unit.spec.ts`

**Resolution**: `resolveHooks(configHooks, phaseHooks)`:

- `phaseHooks === undefined` → inherit all from config
- `phaseHooks === []` → opt out (no hooks)
- Otherwise → merge, deduplicate by `id` (phase wins on collision)

**Execution order within an iteration**:

```
before hooks → LLM invocation → after hooks (severity checked) → on-success/on-failure hooks
```

**Severity × result interaction**:
| severity | ok: true | ok: false |
|----------|-----------|----------------------------------------------|
| 'error' | continue | BLOCK: add to `<errors>`, trigger on-failure |
| 'warn' | continue | CONTINUE: add to `<warnings>` in prompt |
| 'info' | continue | CONTINUE: log only, not in prompt |

Warnings alone don't trigger `on-failure`. Only `error` hooks block.

**Error handling**: hook throws → treated as `{ ok: false, output: error.message }`. Hook timeout → killed, treated as failure.

```typescript
// src/hooks/runner.unit.spec.ts — TDD tests
describe("resolveHooks", () => {
  it("merges config and phase hooks", () => {
    /* ... */
  });
  it("phase hook overrides config hook with same id", () => {
    /* ... */
  });
  it("returns empty when phase has hooks: []", () => {
    /* ... */
  });
  it("inherits all config hooks when phase has hooks: undefined", () => {
    /* ... */
  });
});

describe("hook execution", () => {
  describe("ordering", () => {
    it("runs before → after → on-success in order", async () => {
      /* ... */
    });
    it("runs before → after → on-failure when error hook fails", async () => {
      /* ... */
    });
    it("runs before-phase and after-phase at boundaries", async () => {
      /* ... */
    });
  });
  describe("severity handling", () => {
    it("blocks on error-severity hook failure", async () => {
      /* ... */
    });
    it("collects warnings without blocking", async () => {
      /* ... */
    });
    it("logs info failures without feeding to prompt", async () => {
      /* ... */
    });
    it("skips on-success when any error hook fails", async () => {
      /* ... */
    });
    it("runs on-success when only warn hooks fail", async () => {
      /* ... */
    });
  });
  describe("hook types", () => {
    it("runs shell command for command-based hooks", async () => {
      /* ... */
    });
    it("calls run function with correct HookContext", async () => {
      /* ... */
    });
    it("handles hook that throws as failure", async () => {
      /* ... */
    });
  });
});
```

#### Step 2.3: Git hooks — commit, context, rollback

**Files**: `src/hooks/git-commit.ts`, `src/hooks/git-context.ts`, `src/hooks/git-rollback.ts`, `src/hooks/git.int.spec.ts`

`gitCommit` — stages and commits on success. `gitContext` — gathers `git log` + `git diff --stat` for prompt. `gitRollback` — discards changes on regression.

```typescript
// src/hooks/git.int.spec.ts — TDD tests (needs real git repo in temp dir)
describe("gitCommit", () => {
  it("commits modified files with prefix", async () => {
    /* ... */
  });
});
describe("gitContext", () => {
  it("returns log and diff stat", async () => {
    /* ... */
  });
  it("handles fresh repo", async () => {
    /* ... */
  });
});
describe("gitRollback", () => {
  it("discards working tree changes", async () => {
    /* ... */
  });
});
```

#### Step 2.4: Integrate hooks into execute loop

**Files**: `src/phases/execute.ts` (update), `src/phases/execute.int.spec.ts` (extend)

Replace the hardcoded shell command with the hook runner. Execute loop now runs `before` → LLM → `after` (severity-checked) → `on-success`/`on-failure`. Update prompt builder to separate `<errors>` from `<warnings>`.

```typescript
// src/phases/execute.int.spec.ts — additional TDD tests
describe("Execute with hooks", () => {
  it("runs multiple after-hooks in order", async () => {
    /* ... */
  });
  it("separates warnings from errors in prompt", async () => {
    /* ... */
  });
  it("auto-commits on success via gitCommit hook", async () => {
    /* ... */
  });
  it("gathers git context via before hook", async () => {
    /* ... */
  });
});
```

**Done when**: Full hook lifecycle works. You can configure `hooks.build()`, `hooks.test()`, `hooks.gitCommit()` and they run at the right times.

---

### Phase 3: Config and defineConfig

**Goal**: Move from hardcoded settings to `delorean.config.ts`. Users can customize phases, hooks, model, max iterations.

**What you can do after this phase**: Create a `delorean.config.ts` with `defineConfig({ hooks: [hooks.build(), hooks.test()] })` and Delorean respects it.

#### Step 3.1: Config types and defineConfig

**Files**: `src/types.ts` (extend with `DeloreanConfig`, `Phase`, `PhaseContext`, `PhaseResult`), `src/config.ts`, `src/config.unit.spec.ts`

Add the `Phase` and `DeloreanConfig` types (see "Core type model" and "Full config" sections above for the complete type definitions). Key fields: `model`, `adapter`, `maxIterations`, `phases[]`, `hooks[]`, `budget`, `git`, `stopPoints`, `interact`.

`defineConfig(partial)` — validates and fills defaults (default phases, hooks, model='claude-sonnet-4-6', maxIterations=10). `loadConfig(cwd)` — finds and imports `delorean.config.ts`, calls `defineConfig`, merges CLI arg overrides. Validation: unique phase ids, unique hook ids, no conflicting `produces` fields.

```typescript
// src/config.unit.spec.ts — TDD tests
describe("defineConfig", () => {
  it("fills all defaults when given empty object", () => {
    /* ... */
  });
  it("preserves user-specified phases", () => {
    /* ... */
  });
  it("preserves user-specified hooks", () => {
    /* ... */
  });
  it("throws on duplicate phase ids", () => {
    /* ... */
  });
  it("throws on duplicate hook ids", () => {
    /* ... */
  });
  it("throws on conflicting produces fields", () => {
    /* ... */
  });
  it("merges CLI overrides onto config", () => {
    /* ... */
  });
});
describe("loadConfig", () => {
  it("imports delorean.config.ts from cwd", async () => {
    /* ... */
  });
  it("throws descriptive error when config missing", async () => {
    /* ... */
  });
});
```

#### Step 3.2: Phase factories

**Files**: `src/phases/index.ts`, `src/phases/index.unit.spec.ts`

Factory functions: `phases.brainstorm()`, `phases.spec()`, `phases.plan()`, `phases.execute()`, `phases.review()`. Each returns a plain `Phase` object. Override via spread.

```typescript
// src/phases/index.unit.spec.ts — TDD tests
describe("Phase factories", () => {
  it("execute() needs plan.md, uses fresh sessions", () => {
    /* ... */
  });
  it("brainstorm() produces qa.md, uses resume sessions", () => {
    /* ... */
  });
  it("merges overrides", () => {
    /* ... */
  });
});
```

#### Step 3.3: Wire config into CLI and execute loop

**Files**: `src/cli.ts` (update), `src/phases/execute.ts` (update)

CLI now loads config, merges CLI arg overrides (`--model`, `--max-iterations`). Execute loop reads hooks and settings from config instead of hardcoded values.

**Done when**: `delorean.config.ts` drives behavior. CLI flags override config values.

---

### Phase 4: Lessons and smart prompting

**Goal**: LLM learns from its mistakes. Lessons parsed from output persist across iterations and enter future prompts. Prompt builder gets progress tracking, git context, prior attempts.

**What you can do after this phase**: The LLM outputs `LESSON: [build] use .js extensions` and future iterations see that lesson. Prompts include progress, git context, and prior attempt summaries.

#### Step 4.1: Lesson store + parsing

**Files**: `src/lessons/types.ts`, `src/lessons/store.ts`, `src/lessons/store.unit.spec.ts`, `src/lessons/strategies.ts`

**Lesson type**:

```typescript
type Lesson = {
  id: string;
  category: string; // e.g., 'build-system', 'testing', 'past-mistakes'
  description: string;
  iteration: number;
  phase: string;
  taskId: string;
  violationCount: number; // incremented on dedup
  lastViolatedAt: number; // iteration number
};
```

**Parsing**: regex `/LESSON:\s*\[(\w[\w-]*)\]\s*(.+)/g` extracts from LLM output.

**Deduplication**: `addLesson` checks same category + similar description (substring match). If found, increments `violationCount` and updates `lastViolatedAt`.

**Primacy/recency ordering** for prompt injection:

- Position 1: highest `violationCount` (most frequently re-learned)
- Positions 2..N-1: remaining by recency
- Position N: second-highest `violationCount`

**Strategies** (controls what goes into the prompt):
| Strategy | How it works |
|----------|-------------|
| `recent` | Last N (default 10) + category matches |
| `token-budget` | Score by relevance × recency × violationCount, fit within token budget (default 500 tokens, ~2000 chars) |
| `digest` | LLM-compressed summary of older lessons + raw recent |
| Custom | `(lessons: Lesson[], task: Task) => Lesson[]` |

```typescript
// src/lessons/store.unit.spec.ts — TDD tests
describe("parseLessons", () => {
  it("extracts LESSON: [category] description from text", () => {
    /* ... */
  });
  it("handles multi-line output with code and prose", () => {
    /* ... */
  });
  it("ignores lines without LESSON: prefix", () => {
    /* ... */
  });
});
describe("LessonStore", () => {
  describe("addLesson", () => {
    it("stores a new lesson", () => {
      /* ... */
    });
    it("deduplicates by category + similar description", () => {
      /* ... */
    });
    it("increments violationCount on dedup", () => {
      /* ... */
    });
  });
  describe("selectForPrompt", () => {
    it("returns last N lessons with recent strategy", () => {
      /* ... */
    });
    it("fits within token budget", () => {
      /* ... */
    });
    it("places most-violated lesson first (primacy)", () => {
      /* ... */
    });
    it("places second-most-violated lesson last (recency)", () => {
      /* ... */
    });
  });
  describe("edge cases", () => {
    it("returns empty array when no lessons", () => {
      /* ... */
    });
    it("returns single lesson as-is", () => {
      /* ... */
    });
  });
});
```

#### Step 4.2: Full prompt builder

**Files**: `src/prompt-builder.ts` (extend), `src/prompt-builder.unit.spec.ts` (extend)

Extend the minimal prompt builder to the full context engineering design (see "Context engineering" section above). Two-part delivery:

**System prompt** (via `--append-system-prompt`):

- `<rules>` — behavioral constraints, completion signal, LESSON instruction
- `<lessons>` — categorized, primacy/recency ordered, capped at 15-20

**User prompt** (via `-p`):

- `<task index="N" total="M">` — current work
- `<progress>` — completed task summaries, modified files
- `<git_context>` — recent log + diff stat
- `<errors>` — error-severity hook failures with raw output, source, exit_code attributes
- `<warnings>` — warn-severity failures (visible but non-blocking)
- `<prior_attempts>` — after 3+ iterations on same task

**Key decisions**: XML tags over markdown (no collision with code). Raw error output preserved (no reformatting). Truncation: >200 lines → first 50 + last 50. Context budget target: <50K tokens.

```typescript
// src/prompt-builder.unit.spec.ts — additional TDD tests
describe("buildPrompt (full)", () => {
  describe("system prompt", () => {
    it("includes <rules> block with completion signal", () => {
      /* ... */
    });
    it("includes <lessons> with categories when lessons exist", () => {
      /* ... */
    });
    it("omits <lessons> when no lessons", () => {
      /* ... */
    });
    it("orders lessons by primacy/recency", () => {
      /* ... */
    });
  });
  describe("user prompt", () => {
    it("includes <task> with index and total attributes", () => {
      /* ... */
    });
    it("includes <progress> with completed tasks", () => {
      /* ... */
    });
    it("includes <git_context> when provided", () => {
      /* ... */
    });
  });
  describe("error feedback", () => {
    it("includes <errors> with source and exit_code attrs", () => {
      /* ... */
    });
    it("includes <warnings> separately from errors", () => {
      /* ... */
    });
    it("truncates error output beyond 200 lines", () => {
      /* ... */
    });
  });
  describe("prior attempts", () => {
    it("omits <prior_attempts> before iteration 3", () => {
      /* ... */
    });
    it("includes <prior_attempts> at iteration 3+", () => {
      /* ... */
    });
  });
  describe("section ordering", () => {
    it("orders: task → progress → git_context → errors → prior_attempts", () => {
      /* ... */
    });
  });
});
```

#### Step 4.3: Wire lessons into execute loop

**Files**: `src/phases/execute.ts` (update), `src/state.ts` (extend with lessons)

Execute loop now: parses lessons from LLM output, stores them in state, passes them to prompt builder for subsequent iterations. State gains `lessons` array.

**Done when**: Lessons accumulate, deduplicate, and appear in prompts. Full context engineering works.

---

### Phase 5: Multi-phase pipeline — brainstorm, spec, plan, review

**Goal**: The full pipeline from idea to done. Brainstorm → spec → plan → execute → review with stop points between phases.

**What you can do after this phase**: `npx delorean "build a cache"` starts from brainstorm and goes all the way through.

#### Step 5.1: Interaction handler

**Files**: `src/interact.ts`, `src/interact.unit.spec.ts`

`createInteractHandler()` returns `(question: string) => Promise<string>` using `readline`. Config `interact` field overrides for programmatic use/testing.

```typescript
// src/interact.unit.spec.ts — TDD tests
describe("createInteractHandler", () => {
  it("returns answer from readline", async () => {
    /* ... */
  });
  it("handles EOF gracefully", async () => {
    /* ... */
  });
});
describe("custom interact override", () => {
  it("uses provided function instead of readline", async () => {
    /* ... */
  });
});
```

#### Step 5.2: Brainstorm phase

**Files**: `src/phases/brainstorm.ts`, `src/phases/brainstorm.int.spec.ts`

Q&A loop using `sessionStrategy: 'resume'` — each `claude -p` call continues conversation via `--resume <session_id>`. See "Brainstorm prompt" in design section.

Flow: interpolate `{idea}` → invoke (no --resume, capture session_id) → extract question → interact → append to qa.md → invoke with --resume → repeat until user says "done" or LLM signals `completionPromise`.

```typescript
// src/phases/brainstorm.int.spec.ts — TDD tests
describe("Brainstorm phase", () => {
  describe("Q&A loop", () => {
    it("captures 3 Q&A pairs into qa.md", async () => {
      /* ... */
    });
    it("stores session_id for resume", async () => {
      /* ... */
    });
    it("passes --resume on subsequent calls", async () => {
      /* ... */
    });
  });
  describe("termination", () => {
    it("ends when user says done", async () => {
      /* ... */
    });
    it("ends on completion signal from LLM", async () => {
      /* ... */
    });
  });
  describe("crash recovery", () => {
    it("saves partial state on adapter error", async () => {
      /* ... */
    });
  });
});
```

#### Step 5.3: Spec phase

**Files**: `src/phases/spec.ts`, `src/phases/spec.int.spec.ts`

Two modes: (1) resume from brainstorm session via `--resume $brainstorm_session_id` (Claude already has Q&A context), (2) fresh start reading qa.md from disk. Writes `spec.md`. Stop point for approval.

```typescript
// src/phases/spec.int.spec.ts — TDD tests
describe("Spec phase", () => {
  it("resumes brainstorm session via --resume", async () => {
    /* ... */
  });
  it("reads qa.md from disk when no session", async () => {
    /* ... */
  });
  it("writes spec.md", async () => {
    /* ... */
  });
  it("errors when qa.md missing and no session", async () => {
    /* ... */
  });
  it("triggers stop point after completion", async () => {
    /* ... */
  });
});
```

#### Step 5.4: Plan phase

**Files**: `src/phases/plan.ts`, `src/phases/plan.int.spec.ts`

Uses `--json-schema` for structured task extraction — gets both human-readable plan.md AND machine-parseable `{ tasks: [...] }` via `structured_output`. See "Plan phase runtime" in design section for the JSON schema.

Fallback: if `structured_output` is null, regex parse `## Task N:` headers. Single-task fallback with warning if no structure found.

```typescript
// src/phases/plan.int.spec.ts — TDD tests
describe("Plan phase", () => {
  it("extracts tasks from structured_output", async () => {
    /* ... */
  });
  it("populates state.tasks with correct prompts", async () => {
    /* ... */
  });
  it("resumes spec session when available", async () => {
    /* ... */
  });
  it("falls back to regex when structured_output null", async () => {
    /* ... */
  });
  it("writes plan.md with readable content", async () => {
    /* ... */
  });
  it("triggers stop point after completion", async () => {
    /* ... */
  });
});
```

#### Step 5.5: Review phase

**Files**: `src/phases/review.ts`, `src/phases/review.int.spec.ts`

Uses `sessionStrategy: 'fresh'`. Prompt includes: original spec, `git diff` from session start, completed task list. Can flag issues → trigger fix iterations (re-enter execute for specific tasks). Runs hooks one final time. Custom stop point tasks pause for human review.

```typescript
// src/phases/review.int.spec.ts — TDD tests
describe("Review phase", () => {
  it("passes when LLM approves", async () => {
    /* ... */
  });
  it("triggers fix iteration when LLM flags issue", async () => {
    /* ... */
  });
  it("fails when final hooks fail", async () => {
    /* ... */
  });
});
```

#### Step 5.6: Pipeline orchestrator + smart resume

**Files**: `src/resume.ts`, `src/resume.unit.spec.ts`, `src/cli.ts` (update)

**Smart resume** — `detectEntryPhase(config, cwd)`:

1. `delorean-state.json` exists + status !== 'completed' → resume from saved state
2. Walk phases in reverse — first whose `produces` file exists → start next phase
3. Walk forward — first whose `needs` are all satisfied → start there
4. Nothing found → start from first phase

CLI gains: `--from <phaseId>`, `--idea "..."`, positional idea arg, `--resume`. Pipeline orchestrator runs phases in sequence with stop points between them. State extended with `currentPhase`, `sessions`, `qaHistory`.

```typescript
// src/resume.unit.spec.ts — TDD tests
describe("detectEntryPhase", () => {
  describe("artifact scanning", () => {
    it("starts from brainstorm for empty dir", async () => {
      /* ... */
    });
    it("starts from spec when qa.md present", async () => {
      /* ... */
    });
    it("starts from plan when spec.md present", async () => {
      /* ... */
    });
    it("starts from execute when plan.md present", async () => {
      /* ... */
    });
  });
  describe("state-based resume", () => {
    it("resumes from state when delorean-state.json exists", async () => {
      /* ... */
    });
    it("restores currentTask from state", async () => {
      /* ... */
    });
    it("ignores completed state", async () => {
      /* ... */
    });
  });
  describe("--from override", () => {
    it("forces start from specified phase", async () => {
      /* ... */
    });
    it("warns when needs not satisfied", async () => {
      /* ... */
    });
  });
});
```

**Done when**: Full pipeline works end-to-end. Smart resume picks up where you left off.

---

### Phase 6: Polish — logging, budget, drift protection, test infra

**Goal**: Production-ready features. Cost tracking, logging, test regression detection, and exportable test helpers.

**What you can do after this phase**: Full observability, budget limits, drift guards, and users can test their own custom phases/hooks.

#### Step 6.1: Logging

**Files**: `src/logging/jsonl.ts`, `src/logging/markdown.ts`, `src/logging/logging.unit.spec.ts`

Two parallel loggers sharing a `Logger` interface. Both write to `delorean-logs/` named `{ISO-timestamp}.{jsonl,md}`.

- **JSONL**: `{ timestamp, type, ... }` per line. Event types: `prompt-sent`, `response-received`, `hook-result`, `lesson-learned`, `error-captured`, `token-usage`, `git-commit`, `phase-transition`, `human-input`, `timeout`, `budget-warning`
- **Markdown**: Human-readable sections with headers, code blocks, timestamps.

```typescript
// src/logging/logging.unit.spec.ts — TDD tests
describe("JSONL logger", () => {
  it("creates file with ISO timestamp name", async () => {
    /* ... */
  });
  it("appends one JSON object per line", async () => {
    /* ... */
  });
  it("includes timestamp on each event", async () => {
    /* ... */
  });
  it("handles all event types", async () => {
    /* ... */
  });
});
describe("Markdown logger", () => {
  it("creates .md file in delorean-logs/", async () => {
    /* ... */
  });
  it("formats phase transitions as headers", async () => {
    /* ... */
  });
  it("formats errors as code blocks", async () => {
    /* ... */
  });
});
```

#### Step 6.2: Budget manager

**Files**: `src/budget.ts`, `src/budget.unit.spec.ts`

`createBudgetManager(config.budget)` → `{ track(usage), check(), summary(), estimatePromptCost(text) }`.

**Tracking**: actual cost from CLI `usage` output (primary) + chars/4 estimation (pre-send). Pricing table for opus/sonnet/haiku (overridable). `check()` returns `{ ok, warning?, exceeded? }`. Budget exceeded → `BudgetExceededError` caught by runner → triggers interact.

```typescript
// src/budget.unit.spec.ts — TDD tests
describe("BudgetManager", () => {
  it("accumulates cost across iterations", () => {
    /* ... */
  });
  it("uses correct pricing per model", () => {
    /* ... */
  });
  it("warns at warnAt threshold", () => {
    /* ... */
  });
  it("exceeds at maxCostPerRun", () => {
    /* ... */
  });
  it("never exceeds when no budget configured", () => {
    /* ... */
  });
  it("estimates tokens at chars / 4", () => {
    /* ... */
  });
  it("reports per-iteration breakdown", () => {
    /* ... */
  });
});
```

#### Step 6.3: Drift protection hooks

**Files**: `src/hooks/drift.ts`, `src/hooks/drift.unit.spec.ts`

- `noTestRegression` — runs test command, parses test count from vitest/jest output, compares to previous count in state. Fails if count decreased.
- `diffSizeCheck({ maxDeleteRatio })` — runs `git diff --stat`, parses insertions/deletions, fails if ratio exceeded.

```typescript
// src/hooks/drift.unit.spec.ts — TDD tests
describe("noTestRegression", () => {
  it("passes when test count stays same", async () => {
    /* ... */
  });
  it("passes when test count increases", async () => {
    /* ... */
  });
  it("fails when test count decreases", async () => {
    /* ... */
  });
  it("parses vitest output format", async () => {
    /* ... */
  });
});
describe("diffSizeCheck", () => {
  it("passes when delete ratio within threshold", async () => {
    /* ... */
  });
  it("fails when delete ratio exceeds maxDeleteRatio", async () => {
    /* ... */
  });
});
```

#### Step 6.4: Test infrastructure (exported)

**Files**: `src/testing/fixture.ts`, `src/testing/fixture.unit.spec.ts`, `src/testing/scenarios.ts`

**`createFixture(config)`** — isolated temp directory for integration/e2e tests:

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
  readLog(): Promise<string>;
  fileExists(path: string): Promise<boolean>;
  gitLog(): Promise<string>;
  cleanup(): Promise<void>;
};
```

**Canned scenarios**: `brainstorm3Questions`, `executePassFirstTry`, `executeFailThenPass`, `executeWithLessons`, `planWith5Tasks`, etc.

Exported as public API so users can test their custom phases/hooks.

```typescript
// src/testing/fixture.unit.spec.ts — TDD tests
describe("createFixture", () => {
  it("creates temp dir with specified files", async () => {
    /* ... */
  });
  it("writes delorean-state.json from state config", async () => {
    /* ... */
  });
  it("initializes git repo when git: true", async () => {
    /* ... */
  });
  it("cleanup removes temp dir", async () => {
    /* ... */
  });
  it("readState parses delorean-state.json", async () => {
    /* ... */
  });
});
```

#### Step 6.5: Public API + index exports

**Files**: `src/index.ts`, `src/public-api.unit.spec.ts`

```typescript
export { defineConfig } from './config.ts';
export { phases } from './phases/index.ts';
export { hooks } from './hooks/index.ts';
export { createClaudeCliAdapter } from './llm/claude-cli.ts';
export { createMockAdapter } from './llm/mock-adapter.ts';
export type { DeloreanConfig, Phase, Hook, HookResult, LLMAdapter, Task, Lesson, ... } from './types.ts';
```

```typescript
// src/public-api.unit.spec.ts — TDD tests
describe("Public API exports", () => {
  it("exports defineConfig", async () => {
    /* ... */
  });
  it("exports phase factories", async () => {
    /* ... */
  });
  it("exports hook factories", async () => {
    /* ... */
  });
  it("exports createMockAdapter", async () => {
    /* ... */
  });
  it("produces valid config from imported factories", async () => {
    /* ... */
  });
});
```

#### Step 6.6 (optional): Claude SDK adapter

**Files**: `src/llm/claude-sdk.ts`

Alternative adapter using `@anthropic-ai/claude-agent-sdk` `query()`. Optional peer dependency — package works without it. For users with API credits.

**Done when**: Full observability, budget enforcement, drift protection, exportable test infra. Clean public API.

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
const log: string[] = [];
defineConfig({
  hooks: [
    {
      id: "track-phase",
      when: "before-phase",
      async run(ctx) {
        log.push(`before:${ctx.phase.id}`);
        return { ok: true };
      },
    },
    {
      id: "track-phase-end",
      when: "after-phase",
      async run(ctx) {
        log.push(`after:${ctx.phase.id}`);
        return { ok: true };
      },
    },
    {
      id: "track-iter",
      when: "before",
      async run(ctx) {
        log.push(`before-iter:${ctx.iteration}`);
        return { ok: true };
      },
    },
    {
      id: "track-iter-end",
      when: "after",
      severity: "info",
      async run(ctx) {
        log.push(`after-iter`);
        return { ok: true };
      },
    },
  ],
});
```

**Run**: Pipeline with plan + execute (2 tasks, 1 retry).
**Expected order**: `before:plan`, `after:plan`, `before:execute`, `before-iter:0`, `after-iter`, `before-iter:1`, `after-iter`, `before-iter:2`, `after-iter`, `after:execute`.

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
