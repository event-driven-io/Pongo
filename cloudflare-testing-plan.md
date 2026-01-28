# Cloudflare Workers Compatibility Testing

## Problem

Cloudflare Workers run on [workerd](https://github.com/cloudflare/workerd), not Node.js. Code that uses Node.js APIs (`fs`, `net`, `Buffer`, `process`, etc.) will fail at runtime. You want to catch these issues before deployment.

## Solution: Three Layers of Verification

| Layer                   | Speed               | What It Catches                                                      |
| ----------------------- | ------------------- | -------------------------------------------------------------------- |
| **ESLint**              | Instant (lint-time) | `import` statements from `node:*` or Node.js builtins                |
| **TypeScript**          | Fast (compile-time) | Usage of Node.js globals (`Buffer`, `process`, `__dirname`)          |
| **Vitest Pool Workers** | Slower (runtime)    | Everything - polyfill gaps, dynamic imports, runtime API differences |

Why three layers? ESLint and TypeScript give fast feedback during development. Vitest Pool Workers is the definitive check - it runs your code inside actual workerd, not a mock.

---

## Files to Create/Modify

| File                                                                                             | Action                                                                  |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [src/package.json](src/package.json)                                                             | Add `eslint-plugin-import`, `@cloudflare/vitest-pool-workers`, `vitest` |
| [src/eslint.config.mjs](src/eslint.config.mjs)                                                   | Add `import/no-nodejs-modules` rule for cloudflare code                 |
| [src/packages/dumbo/tsconfig.cloudflare.json](src/packages/dumbo/tsconfig.cloudflare.json)       | Create - TypeScript check without `@types/node`                         |
| [src/packages/dumbo/vitest.cloudflare.config.ts](src/packages/dumbo/vitest.cloudflare.config.ts) | Create - Vitest config for workerd pool                                 |
| [src/packages/dumbo/wrangler.toml](src/packages/dumbo/wrangler.toml)                             | Create - Minimal config for test runner                                 |
| [src/packages/dumbo/package.json](src/packages/dumbo/package.json)                               | Add `check:cloudflare`, `test:cloudflare` scripts                       |
| [src/packages/pongo/tsconfig.cloudflare.json](src/packages/pongo/tsconfig.cloudflare.json)       | Create                                                                  |
| [src/packages/pongo/vitest.cloudflare.config.ts](src/packages/pongo/vitest.cloudflare.config.ts) | Create                                                                  |
| [src/packages/pongo/wrangler.toml](src/packages/pongo/wrangler.toml)                             | Create                                                                  |
| [src/packages/pongo/package.json](src/packages/pongo/package.json)                               | Add scripts                                                             |

---

## Implementation

### 1. Install Dependencies

```bash
cd src
npm install -D eslint-plugin-import @cloudflare/vitest-pool-workers vitest@~3.0.0
```

Why these versions: `@cloudflare/vitest-pool-workers` requires Vitest 2.0.x–3.2.x per [Cloudflare docs](https://developers.cloudflare.com/workers/testing/vitest-integration/).

### 2. ESLint: Block Node.js Imports

Edit [src/eslint.config.mjs](src/eslint.config.mjs):

```javascript
import importPlugin from 'eslint-plugin-import';

// Add to the default export array:
{
  files: [
    'packages/dumbo/src/core/**/*.ts',
    'packages/pongo/src/core/**/*.ts',
    'packages/dumbo/src/storage/sqlite/core/**/*.ts',
    'packages/pongo/src/storage/sqlite/core/**/*.ts',
    'packages/dumbo/src/storage/sqlite/d1/**/*.ts',
    'packages/pongo/src/storage/sqlite/d1/**/*.ts',
    'packages/dumbo/src/cloudflare.ts',
    'packages/pongo/src/cloudflare.ts',
  ],
  ignores: ['**/*.spec.ts'],
  plugins: { 'import': importPlugin },
  rules: {
    'import/no-nodejs-modules': 'error',
  },
},
```

Why these paths:

- **core/** - Shared across all implementations, must work everywhere
- **storage/sqlite/core/** - Shared between sqlite3 and D1
- **storage/sqlite/d1/** - Cloudflare-specific
- **cloudflare.ts** - Entry points

Why exclude `*.spec.ts`: Tests run in Node.js (via Miniflare), not in Workers.

Rule docs: [eslint-plugin-import/no-nodejs-modules](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-nodejs-modules.md)

### 3. TypeScript: Exclude Node.js Types

Create `src/packages/dumbo/tsconfig.cloudflare.json`:

```json
{
  "extends": "../../tsconfig.shared.json",
  "include": [
    "./src/cloudflare.ts",
    "./src/storage/sqlite/d1/**/*.ts",
    "./src/storage/sqlite/core/**/*.ts",
    "./src/core/**/*.ts"
  ],
  "exclude": ["**/*.spec.ts", "**/node_modules"],
  "compilerOptions": {
    "composite": false,
    "noEmit": true,
    "types": ["@cloudflare/workers-types"],
    "skipLibCheck": false
  }
}
```

Why `"types": ["@cloudflare/workers-types"]` only: This removes `@types/node` from the compilation. Any code using `Buffer`, `process`, or `__dirname` will fail type-checking.

Why `"noEmit": true`: This config is for checking only, not building.

### 4. Vitest Pool Workers: Runtime Verification

Create `src/packages/dumbo/vitest.cloudflare.config.ts`:

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["src/**/*.cloudflare.spec.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: { d1Databases: { DB: "test-db-id" } },
      },
    },
  },
});
```

Create `src/packages/dumbo/wrangler.toml`:

```toml
name = "dumbo-cloudflare-test"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "test-db"
database_id = "test-db-id"
```

Why Vitest Pool Workers: Unlike Miniflare (which you already use), the [Vitest pool](https://blog.cloudflare.com/workers-vitest-integration/) runs your **test code** inside workerd, not just the Worker handlers. This catches incompatibilities in your library code itself.

### 5. Add Scripts

Add to [src/packages/dumbo/package.json](src/packages/dumbo/package.json):

```json
{
  "scripts": {
    "check:cloudflare": "tsc -p tsconfig.cloudflare.json",
    "test:cloudflare": "vitest run -c vitest.cloudflare.config.ts"
  }
}
```

Same for [src/packages/pongo/package.json](src/packages/pongo/package.json).

### 6. Create Cloudflare Test Files

Create test files with `.cloudflare.spec.ts` suffix. These run inside workerd:

```
src/packages/dumbo/src/storage/sqlite/d1/d1Client.cloudflare.spec.ts
src/packages/dumbo/src/core/sql/sql.cloudflare.spec.ts
```

---

## What's NOT Restricted (and Why)

| Path                      | Why Unrestricted                                        |
| ------------------------- | ------------------------------------------------------- |
| `storage/postgresql/`     | `pg` package requires Node.js TCP (`net`, `tls`, `dns`) |
| `storage/sqlite/sqlite3/` | Native C++ addon - cannot run on edge runtimes          |

For edge-compatible PostgreSQL, add a separate implementation using [@neondatabase/serverless](https://github.com/neondatabase/serverless) or Cloudflare Hyperdrive.

---

## Verification

```bash
# 1. ESLint - catches node:* imports
cd src && npm run lint

# 2. TypeScript - catches Node.js globals
cd src/packages/dumbo && npm run check:cloudflare

# 3. Vitest workerd - catches everything else
cd src/packages/dumbo && npm run test:cloudflare

# 4. Existing tests still pass
cd src/packages/dumbo && npm test
```

---

## Current Status

Verified: No existing violations in source code. All `node:*` imports are in test files (excluded). These rules prevent future regressions.

---

## Sources

- [Cloudflare Vitest Integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Cloudflare Workers Node.js Compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
- [Workers Node.js Compat Matrix](https://workers-nodejs-compat-matrix.pages.dev/)
- [eslint-plugin-import no-nodejs-modules](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-nodejs-modules.md)
- [workerd runtime](https://github.com/cloudflare/workerd)
