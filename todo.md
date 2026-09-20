# Cloudflare samples: state

Plan and prompts: [plan.md](plan.md). Run checks from each sample directory.

- [x] **Research and API shape**: done 2026-09-20; every write now answers with the cart (201 with `Location` when one is opened, 200 otherwise), as Stripe, BigCommerce and commercetools do
- [x] **Now, step 1**: identical specs in both samples, all suites green (2026-09-19; the DO concurrency flake seen there is explained in plan.md "Findings from step 2" and fixed)
- [x] **Now, step 2**: one change in both samples, done 2026-09-20, not committed; all green, with "rejects a missing request body" commented out with a TODO until Emmett E5
- [x] **Now, open item**: cause found; workerd logs every error a DO RPC method throws. Decide between the three options in plan.md "Findings from step 2"
- [ ] **Emmett**: E1 `asyncRetry` defaults, E2 `undefined` timeouts, E3 `assertUnsignedBigInt` throws `ValidationError`, E4 `assertPositiveInteger`, E5 framework HTTP errors mapped to 500 (confirmed; one commented-out test in both samples waits on it), E6 `assertNotEmptyStringOrWhitespace`, E7 test assertions the samples write by hand; every item for Hono and Express alike
- [ ] **Pongo**: P1 SQLite insert with `ON CONFLICT(_id) DO NOTHING`, P2 `handle` document typed with `_version`, P3 `handle` by filter, P4 `db()` without a name silently drops the schema, P5 given/when/then specification for `handle`
- [ ] **Follow-up**: bump packages; open cart via `handle` by filter; delete casts, `positiveInteger` and explicit retry delays
- [ ] **Open, last**: a version mismatch on a missing document (404 or 412); then delete the temporary `findOne`
