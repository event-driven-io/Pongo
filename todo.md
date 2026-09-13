# Cloudflare samples implementation

This file tracks the approval-gated implementation of [`spec.md`](./spec.md). Only the active phase is changed before the next user approval.

## Phase 1: Standalone Cloudflare scaffolds

Status: Awaiting approval

- [x] Use the current generated Cloudflare Hono Worker as the Worker configuration baseline.
- [x] Create independent `samples/cloudflare/d1` and `samples/cloudflare/durable-objects` npm projects.
- [x] Copy and adapt the specified EditorConfig, Prettier, ESLint, and VS Code setup.
- [x] Add the final D1 and Durable Object Wrangler binding declarations.
- [x] Pin the latest mutually compatible dependencies and create both lockfiles.
- [x] Generate and check in `worker-configuration.d.ts` for both projects.
- [x] Verify TypeScript, linting, generated types, and dry-run Worker bundles.
- [x] Add immediately runnable GitHub Actions validation workflows for both scaffolds.
- [ ] Receive approval to begin Phase 2.

Verification completed in both sample directories:

- `npm install` produced the lockfiles, and a clean `npm ci` then passed in both samples with no reported vulnerabilities.
- `npm run types:cloudflare:check` passed.
- `npm run build:ts` passed.
- `npm run lint` passed.
- `npm run build` passed as a Wrangler dry-run bundle and resolved the expected binding.

Tests are intentionally deferred because the shopping-cart test files are introduced test-first in Phase 2.

## Phase 2: Shopping-cart domain

Status: Not started

- [ ] Copy the seven-file Emmett shopping-cart feature slice into each sample.
- [ ] Rewrite the document model and pure business functions without event-sourcing code.
- [ ] Write the colocated domain tests first and verify them in both samples.
- [ ] Receive approval to begin Phase 3.

## Phase 3: D1 application

Status: Not started

- [ ] Add the Pongo schema and partial unique index.
- [ ] Implement the Hono routes, D1 composition, current-cart flow, and migration endpoint.
- [ ] Write and run D1 integration and HTTP E2E tests against local Cloudflare bindings.
- [ ] Receive approval to begin Phase 4.

## Phase 4: Durable Object application

Status: Not started

- [ ] Add the same local Pongo schema and partial unique index.
- [ ] Implement the client-keyed Durable Object, per-object migration, typed RPC, transactions, and Hono routes.
- [ ] Write and run Durable Object integration and HTTP E2E tests against local Cloudflare bindings.
- [ ] Receive approval to begin Phase 5.

## Phase 5: Getting Started documentation

Status: Not started

- [ ] Add self-contained `requests.http` walkthroughs.
- [ ] Write each sample README in the requested Getting Started style.
- [ ] Add `samples/README.md` linking all samples.
- [ ] Receive approval to begin Phase 6.

## Phase 6: Automated validation and deployment

Status: Partially implemented

- [x] Add the two path-filtered GitHub Actions validation workflows based on the named Emmett workflow.
- [ ] Add `npm test` to both validation jobs after the test files exist.
- [ ] Configure upstream-main-only deployment, automatic D1 migration, and Durable Object deployment.
- [ ] Validate workflow configuration without using deployment credentials.
- [ ] Receive approval to begin Phase 7.

## Phase 7: Final verification and review

Status: Not started

- [ ] Run each sample's generated-type check, TypeScript build, lint, unit tests, integration tests, E2E tests, and Wrangler dry-run bundle.
- [ ] Run the repository-required unit suite and then the full test suite for the final application-code handoff.
- [ ] Review the implementation against every acceptance criterion in `spec.md`.
- [ ] Report final results and any skipped checks.
