# Cloudflare shopping-cart internal refactoring

## Keep the existing contract

- `POST /clients/:clientId/shopping-carts/current/product-items` finds or creates the active cart and returns its permanent URL in `Location`.
- Later add, remove, confirm, cancel, and read operations use that permanent cart URL.
- `GET /clients/:clientId/shopping-carts/current` remains a convenience and recovery query.
- Keep version-only ETags. The permanent cart ID in the request URL identifies the resource.
- Keep D1 and Durable Object HTTP behavior aligned while using storage-specific coordination internally.

No routes, request bodies, or response shapes change during this refactoring.

## Phase 1: Lock the existing behavior with tests

Update both integration suites before changing production code:

- Keep all scenarios and assertions inside `ApiE2ESpecification` and exercise only the HTTP API.
- Capture ETags as opaque values instead of asserting exact version strings.
- Cover stale ETags for add, remove, confirm, and cancel.
- Cover cross-client reads and mutations by permanent cart ID.
- Specify missing-cart behavior consistently: add, remove, and confirm return `404`; repeated cancellation returns `204`.
- Keep the concurrent first-addition scenario: both additions succeed, one response is `201`, the other is `204`, and one active cart contains both products.
- Confirm that the new or corrected cases expose the current D1 and Durable Object differences.

Stop for review.

## Phase 2: Simplify D1 persistence orchestration

In `samples/cloudflare/d1/src/shoppingCarts/api.ts`:

- Keep the current-cart addition loop separate. It alone discovers the active cart, allocates an ID, and retries optimistic or unique-index conflicts.
- Add one local `handleOwnedCart` helper for known-ID add, remove, and confirm.
- Have the helper validate that the document belongs to `clientId`, call `collection.handle`, assert success, and return the stored document.
- Preserve one ownership validation path for the shared D1 database, including `404` for another client's cart.
- Keep cancellation separate because an already missing document is an idempotent success.
- Do not add transactions, a repository, a command bus, or a cross-sample abstraction.

Run the D1 unit and integration tests, then `npm run test:unit` from `src`.

Stop for review.

## Phase 3: Simplify Durable Object persistence orchestration

In `samples/cloudflare/durable-objects/src/shoppingCarts/shoppingCartDurableObject.ts`:

- Keep the Cloudflare-required exported class and its typed, use-case-specific RPC methods.
- Keep HTTP validation and product-price resolution in the Hono Worker.
- Keep pure shopping-cart decisions in `businessLogic.ts`.
- Move shared implementation behind module-pattern functions rather than adding another class.
- Keep `addProductItemToCurrent` separate and use one Pongo transaction for its current-cart lookup and write.
- Add one shared known-ID handling function for add, remove, and confirm.
- Do not wrap known-ID changes in separate outer transactions; their permanent ID and expected version target one document through `collection.handle`.
- Rely on the client-keyed Durable Object database as the ownership boundary. Do not repeat D1-style ownership reads and assertions for every known-ID mutation.
- Keep cancellation separate because an already missing document is an idempotent success.
- Keep one serializable RPC result conversion for expected failures; allow unexpected exceptions to propagate.

Run the Durable Object unit and integration tests, then `npm run test:unit` from `src`.

Stop for review.

## Phase 4: Verify parity and finish the sample

- Ensure both samples expose the unchanged route and response contract.
- Ensure both samples agree on missing carts, cross-client access, stale ETags, confirmation, cancellation, successor carts, and concurrent first additions.
- Update the focused D1 Worker E2E scenarios and add the missing Durable Object Worker E2E scenarios through `exports.default.fetch`.
- Update only the affected implementation details and acceptance criteria in `spec.md`.
- Update `todo.md` without starting the documentation phase.
- Run `npm test` in both samples, `npm run test:unit` from `src`, and `git diff --check`.

Stop for approval.
