# Cloudflare samples implementation

This file tracks the approval-gated implementation of [`spec.md`](./spec.md). Only the active phase is changed before the next user approval.

## Phase 1: Standalone Cloudflare scaffolds

Status: Complete

- [x] Use the current generated Cloudflare Hono Worker as the Worker configuration baseline.
- [x] Create independent `samples/cloudflare/d1` and `samples/cloudflare/durable-objects` npm projects.
- [x] Copy and adapt the specified EditorConfig, Prettier, ESLint, and VS Code setup.
- [x] Add the final D1 and Durable Object Wrangler binding declarations.
- [x] Pin the latest mutually compatible dependencies and create both lockfiles.
- [x] Generate and check in `worker-configuration.d.ts` for both projects.
- [x] Verify TypeScript, linting, generated types, and dry-run Worker bundles.
- [x] Add immediately runnable GitHub Actions validation workflows for both scaffolds.
- [x] Receive approval to begin Phase 2.

Verification completed in both sample directories:

- `npm install` produced the lockfiles, and a clean `npm ci` then passed in both samples with no reported vulnerabilities.
- `npm run types:cloudflare:check` passed.
- `npm run build:ts` passed.
- `npm run lint` passed.
- `npm run build` passed as a Wrangler dry-run bundle and resolved the expected binding.

Tests are intentionally deferred because the shopping-cart test files are introduced test-first in Phase 2.

## Phase 2: Shopping-cart domain

Status: Awaiting approval

- [x] Adapt the domain/type/test part of the seven-file Emmett shopping-cart feature slice in each sample; add the narrow API-only barrel with the API and API tests in Phases 3 and 4.
- [x] Rewrite the immutable document model and pure business functions without event-sourcing code, using Emmett-compatible readonly command contracts and `CommandType['data']` inputs.
- [x] Encapsulate immutable product-line quantity changes in `ProductItems.withUpdatedQuantity`, using positive changes for additions and negative changes for removals as in the Emmett sample.
- [x] Write the colocated domain tests with explicit Given/When/Then sections and verify them in both samples.
- [x] Verify that Pongo `handle` accepts newly returned immutable documents and does not depend on in-place mutation.
- [ ] Receive approval to begin Phase 3.

Verification completed:

- The initial `npm run test:unit` failed in both samples because the tested domain modules did not exist yet.
- After implementation, `npm test` passed in both samples with 14 tests each.
- `npm run build:ts`, `npm run lint`, and the Wrangler `npm run build` dry run passed in both samples.
- The repository `npm run test:unit` passed from `src` with 87 files and 1,286 tests.
- `git diff --check` and Prettier checks for this ledger and both workflows passed.

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
- [x] Add `npm test` to both validation jobs after the test files exist.
- [ ] Configure upstream-main-only deployment, automatic D1 migration, and Durable Object deployment.
- [ ] Validate workflow configuration without using deployment credentials.
- [ ] Receive approval to begin Phase 7.

## Phase 7: Final verification and review

Status: Not started

- [ ] Run each sample's generated-type check, TypeScript build, lint, unit tests, integration tests, E2E tests, and Wrangler dry-run bundle.
- [ ] Run the repository-required unit suite and then the full test suite for the final application-code handoff.
- [ ] Review the implementation against every acceptance criterion in `spec.md`.
- [ ] Report final results and any skipped checks.
