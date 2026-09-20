# Cloudflare samples: plan

Scope: `samples/cloudflare/d1` and `samples/cloudflare/durable-objects`.

Stages: "Now" in the samples (step 1 and step 2), then Emmett and Pongo changes, then the follow-up once those are released. "Open, last" is discussed after everything else. Every code block says which stage it shows.

Status on 2026-09-20: step 1 and step 2 are done in the working tree, not committed. Both samples pass 19 unit, 37 integration and their e2e tests, and `agent:check`. The "rejects a missing request body" case is commented out with a TODO until Emmett E5 lands.

## Decided

- Both samples expose the same API behaviour and have the same specs. Making the specs identical is the first step.
- Business logic and its unit tests are the same files in both samples: `businessLogic.ts`, `shoppingCart.ts` and `businessLogic.unit.spec.ts` (identical today).
- Both samples follow the same steps. D1's routes call Pongo's `handle` with the business function directly; there's no extra layer. The DO's routes only call the Durable Object, and the Durable Object method makes that same `handle` call.
- The Web API gets every dependency injected explicitly, built once. `index.ts` is the only place that reads `env`.
- Eventually there is no `findOne` before `handle`. Any read before `handle` in "Now" is temporary.
- Decisions belong in business code or in Pongo's version check, not in routes.
- Cancel is a state change, like confirm: `POST /clients/:clientId/shopping-carts/:shoppingCartId/cancel` sets status `Cancelled` and keeps the document. Stripe (`POST /v1/payment_intents/:id/cancel`) and Shopify (`POST /orders/:id/cancel.json`) do the same; `DELETE` means removal there.
- `Location` only where HTTP defines it: on 201 (RFC 9110 §10.2.2).
- Every write answers with the cart: 201 with `Location` and the body when a cart is opened, 200 with the body otherwise. `ETag` is on every answer, so `If-Match` is unchanged. This follows Stripe, BigCommerce and commercetools (see "Open"), and it means a client that posts to `/current` learns the cart's id and its new totals from the answer.
- Request bodies go through Hono's `validator('json', ...)`.
- One operation per statement; calls with several values take one object with named fields.
- Business rule errors stay as they are: `EmmettError` with `errorCode: 409`.
- Pongo's SQLite insert uses `ON CONFLICT(_id) DO NOTHING`, like PostgreSQL.
- Pongo's `handle` accepts a filter, e.g. `{ clientId, status: 'Opened' }` or `{ _id, clientId, expectedVersion }`.
- No query functions. Where a read finds nothing, the code that reads throws `NotFoundError` right there: D1's route, the DO's method. In the DO, reads are Durable Object methods (`getById`, `getCurrent`).
- `/:shoppingCartId` routes read by `_id` and `clientId`, because they name one cart, which may already be confirmed or cancelled. `/current` routes read by `clientId` and `status: 'Opened'`.
- The open-cart route retries with `asyncRetry` in the API layer, in both samples.
- The DO opens its database as `client.database`, the typed schema's database.
- Malformed JSON stays a 500 until Emmett fixes it (E5). No workaround in the samples; the `['a missing request body', undefined]` case is commented out with a TODO in both samples and comes back with E5.
- Test expectations are data given to `expectResponse`: status, body, headers. What it can't express yet is an Emmett gap (E7), not a reason for hand-written assertions in the samples.

## Open

Research, later:

- **The real API shape for adding to an existing cart (done).** Was: 204, no `Location`, no id, so the client had to read `GET /clients/:clientId/shopping-carts/current` afterwards. What others do (checked 2026-09-20):
  - Stripe updates with `POST /v1/payment_intents/:id` and answers 200 with the whole object. Its API returns the resource from every write.
  - BigCommerce's storefront `POST /carts/:cartId/items` answers 200 with "the cart, including the newly added items". It has no current-cart alias; the client keeps the id.
  - commercetools updates a cart by id and returns the `Cart`, and has a separate `GET /{projectKey}/me/active-cart` for the current one.

  So the common shape is: a write returns the resource, and a "current" alias exists only for finding it.

  Decided and done: every write answers with the cart, 201 with `Location` when one is opened and 200 otherwise. What we keep that Stripe doesn't have: `If-Match` with weak ETags, so a client can't change a cart from a stale copy, and 201 with `Location` for a created cart.

Discuss last: see "Open, last" at the end.

Decide: the three options under "Findings from step 2" for the workerd log lines in the DO tests.

## Why the samples are complex

1. **The database comes from `context.env`.** Bindings were reachable only inside a request, so every API is a factory with a `getPongoDb(bindings)` getter and a `Bindings` type parameter. Emmett's `WebApiSetup` is `(router: Hono) => void`, so `index.ts` builds its own `Hono<{ Bindings }>` and mounts it on an empty `getApplication({ apis: [] })`. Emmett's test helper calls `fetch(request)` without `env`, so the tests wrap `app.fetch(request, env)` in a closure. Cloudflare documents `import { env } from 'cloudflare:workers'`, including a database client created at module level. With it, `index.ts` builds the dependencies once and passes them to the API, the way Emmett's Hono sample passes its stores.
2. **Extra reads.** `handle` only takes ids, so the samples read first: to find the open cart, and to tell a missing cart (404) from a stale version (412). D1 reads more than that: `handleOwnedCart` reads, then checks ownership again inside `handle`, and `DELETE` can read three times.
3. **D1 has `throwOnOperationFailures` off.** So it checks `result.successful` by hand, calls `assertSuccessful()`, and loops with `continue`.
4. **Emmett's helpers aren't used.** ETags, responses and validation are hand-written: `expectedVersionFromIfMatch`, `setCartETag`, `noContentAt`, `cartResponse`, `routeIds`, `requiredIdentifier`, `resolveUnitPrice`, `documentVersion`, `toResponse`, `requiredDocument`.
5. **Cancel deletes the cart.** `cancel` returns `null`, so `handle` deletes the document. That needs its own rules: a `DELETE` route, 204 for a missing cart, an optional `If-Match`, and a re-read for a cart deleted mid-request.
6. **The samples were written separately.** Their specs differ in 343 lines for the same 35 cases. The DO sample has an ownership check that can never fail. Both copy the price table into `index.ts` and the integration spec.

## Your points

- **`throwOnOperationFailures` missing in D1.** Turn it on in the one D1 client. Now.
- **The `givenApi` setup; is Emmett the limit?** Yes: `WebApiSetup` has no bindings type and the test helper calls `fetch(request)` without `env`. With dependencies injected, tests pass `getApplication` like Emmett's Hono sample. No Emmett change needed. Now.
- **`while (true)`.** Replace it with `asyncRetry`, 3 retries, `minTimeout: 100, factor: 1.5` (Emmett's command handler values). Without them the `retry` package waits 1–2 s before the first retry (measured: 1970 ms). Now.
- **Throwing inside `asyncRetry`.** Works. On D1 today the open-cart race shows up as `ConcurrencyError`, because SQLite's `INSERT OR IGNORE` skips the second open cart (checked on D1 through Pongo). After Pongo P1 it shows up as `UniqueConstraintError`. The route retries on both. Only the open-cart route retries: on `If-Match` routes a 412 means the client's copy is stale. Now.
- **Emmett ETag helpers.** `assertUnsignedBigInt(getETagValueFromIfMatch(context))` to read, as Emmett's README does, and `toWeakETag(version)` to write. Now.
- **Singleton.** One module-level `pongoDb` in `src/pongo.ts`, used by `index.ts` and the integration spec. Pongo does no I/O when it builds the client and migrates on first use. Now.
- **Redundant reads.** End state: none, one `handle` call per mutation. Now: one temporary `findOne` per mutation.
- **`handle` with a filter such as `{ clientId, status: 'Opened' }`.** Pongo P3. It removes the open-cart `findOne`, `handleOwnedCart`, and the ownership check.

## Target code

### Wiring (Now, both samples)

D1 `src/pongo.ts`:

```ts
import { pongoClient } from '@event-driven-io/pongo';
import { d1Driver } from '@event-driven-io/pongo/cloudflare';
import { env } from 'cloudflare:workers';
import pongoConfig from './pongo.config';

export const pongoDb = pongoClient({
  driver: d1Driver,
  database: env.DB,
  schema: {
    definition: pongoConfig.schema,
    autoMigration:
      env.ENVIRONMENT === 'development' ? 'CreateOrUpdate' : 'None',
  },
  errors: { throwOnOperationFailures: true },
}).database;
```

D1 `src/index.ts`:

```ts
export default getApplication({
  apis: [
    migrationsApi({ pongoDb, migrationToken: env.MIGRATION_TOKEN }),
    shoppingCartApi({
      pongoDb,
      getUnitPrice,
      getCurrentTime: () => new Date(),
    }),
  ],
});
```

DO `src/index.ts`:

```ts
export { ShoppingCartDurableObject };

export default getApplication({
  apis: [
    shoppingCartApi({
      shoppingCarts: env.SHOPPING_CARTS,
      getUnitPrice,
      getCurrentTime: () => new Date(),
    }),
  ],
});
```

Integration spec, D1 (the DO passes `shoppingCarts: env.SHOPPING_CARTS` instead):

```ts
beforeAll(async () => {
  await pongoDb.schema.migrate();
});

const givenApi = (now = new Date()) =>
  ApiE2ESpecification.for({
    getApplication: () =>
      getApplication({
        apis: [
          shoppingCartApi({ pongoDb, getUnitPrice, getCurrentTime: () => now }),
        ],
      }),
  });
```

### Mutation on an existing cart (end state, after Pongo P1–P3 and "Open, last")

D1 route. The API receives `pongoDb` and takes the collection once: `const shoppingCarts = pongoDb.collection<ShoppingCart>('shoppingCarts');`.

```ts
router.post(
  '/clients/:clientId/shopping-carts/:shoppingCartId/confirm',
  async (context) => {
    const { clientId, shoppingCartId } = context.req.param();
    const expectedVersion = assertUnsignedBigInt(
      getETagValueFromIfMatch(context),
    );

    const { document: cart } = await shoppingCarts.handle(
      { _id: shoppingCartId, clientId, expectedVersion },
      (state) => confirm({ now: getCurrentTime() }, state),
    );

    const { _version, ...body } = cart;

    return OK({ context, body, eTag: toWeakETag(_version) });
  },
);
```

DO route. The API receives the `shoppingCarts` namespace:

```ts
router.post(
  '/clients/:clientId/shopping-carts/:shoppingCartId/confirm',
  async (context) => {
    const { clientId, shoppingCartId } = context.req.param();
    const expectedVersion = assertUnsignedBigInt(
      getETagValueFromIfMatch(context),
    );

    const shoppingCart = shoppingCarts.getByName(clientId);
    const cart = await shoppingCart.confirm({
      shoppingCartId,
      expectedVersion,
      now: getCurrentTime(),
    });

    const { _version, ...body } = cart;

    return OK({ context, body, eTag: toWeakETag(_version) });
  },
);
```

DO method:

```ts
async confirm({ shoppingCartId, expectedVersion, now }: ConfirmShoppingCart) {
  const { document: cart } = await this.#shoppingCarts.handle(
    { _id: shoppingCartId, expectedVersion },
    (state) => confirm({ now }, state),
  );
  return cart;
}
```

Add, remove and cancel have the same shape. The response for a missing cart depends on "Open, last".

### Mutation on an existing cart (Now, temporary)

Until Pongo P3 ships and "Open, last" is decided, one read before `handle` gives the 404. The follow-up removes it.

D1 route body:

```ts
const existing = await shoppingCarts.findOne({ _id: shoppingCartId, clientId });
if (existing === null)
  throw new NotFoundError({ id: shoppingCartId, type: 'Shopping cart' });

const result = await shoppingCarts.handle(
  { _id: shoppingCartId, expectedVersion },
  (state) => confirm({ now: getCurrentTime() }, state),
);
const cart = result.document as WithIdAndVersion<ShoppingCart>;

const { _version, ...body } = cart;

return OK({ context, body, eTag: toWeakETag(_version) });
```

DO method: the same `findOne` by `_id` (the Durable Object holds one client's carts), throw, `handle` and cast. The DO route is already in its end-state shape. The cast goes away with Pongo P2.

### Add a product to the current cart (Now)

```ts
router.post(
  '/clients/:clientId/shopping-carts/current/product-items',
  productItemBody,
  async (context) => {
    const { clientId } = context.req.param();
    const { productId, quantity } = context.req.valid('json');
    const unitPrice = await getUnitPrice(productId);
    const now = getCurrentTime();

    const { cart, created } = await asyncRetry(
      async () => {
        const current = await shoppingCarts.findOne({
          clientId,
          status: 'Opened',
        });
        const shoppingCartId = current?._id ?? crypto.randomUUID();

        const result = await shoppingCarts.handle(
          {
            _id: shoppingCartId,
            expectedVersion: current?._version ?? 'DOCUMENT_DOES_NOT_EXIST',
          },
          (state) =>
            addProductItem(
              {
                clientId,
                shoppingCartId,
                productItem: { productId, quantity, unitPrice },
                now,
              },
              state,
            ),
        );

        return {
          cart: result.document as WithIdAndVersion<ShoppingCart>,
          created: current === null,
        };
      },
      {
        retries: 3,
        minTimeout: 100,
        factor: 1.5,
        shouldRetryError: (error) =>
          error instanceof ConcurrencyError ||
          error instanceof UniqueConstraintError,
      },
    );

    const { _version, ...body } = cart;
    const eTag = toWeakETag(_version);

    if (created)
      return Created({ context, url: shoppingCartUrl(cart), body, eTag });

    return OK({ context, body, eTag });
  },
);
```

`shouldRetryError` is `isConflict`, which uses `DumboError.isInstanceOf(error, { errorType })` instead of `instanceof`. An error thrown inside a Durable Object reaches the Worker as a plain `Error` that keeps its own properties (`errorCode`, `errorType`), so `instanceof` is always false there. Measured: with `instanceof`, 3 of 100 concurrent pairs still ended in 412; with `isConflict`, 300 of 300 pairs came back 201 and 200.

The answer carries the cart, so the client knows its id and totals. After Pongo P3, the `findOne` goes: the retried function calls `handle({ clientId, status: 'Opened' }, ...)` directly. The DO route wraps its `addProductItemToCurrent` call in the same `asyncRetry`.

### Request body (Now, both samples)

```ts
type ProductItemRequest = { productId?: unknown; quantity?: unknown };

const productItemBody = validator('json', (body: ProductItemRequest) => ({
  productId: assertNotEmptyString(body.productId),
  quantity: positiveInteger(body.quantity, 'quantity'),
}));
```

Hono's validator parses the body before the route runs. It throws `HTTPException(400)` for malformed JSON, and passes `{}` when the `Content-Type` isn't JSON, which the asserts then reject with 400. `positiveInteger` stays local, because Emmett's `assertPositiveNumber` accepts `1.5`.

### Read a cart (Now, both samples)

D1 route body:

```ts
const { clientId, shoppingCartId } = context.req.param();

const cart = await shoppingCarts.findOne({ _id: shoppingCartId, clientId });
if (cart === null)
  throw new NotFoundError({ id: shoppingCartId, type: 'Shopping cart' });

const { _version, ...body } = cart;

return OK({ context, body, eTag: toWeakETag(_version) });
```

`GET /current` is the same with `{ clientId, status: 'Opened' }` and `id: clientId`. DO: the route calls the Durable Object's `getById({ shoppingCartId })` or `getCurrent()`, and the method does the `findOne` and the throw. A `NotFoundError` thrown in the Durable Object adds to the log lines in "Now: open item, DO test output".

### Business logic (Now, both samples, identical)

```ts
export type CancelShoppingCart = Readonly<{
  type: 'CancelShoppingCart';
  data: Readonly<{ now: Date }>;
}>;

export const cancel = (
  command: CancelShoppingCart['data'],
  state: ShoppingCart | null,
): ShoppingCart => {
  if (state?.status === 'Cancelled') return state;
  if (state?.status !== 'Opened')
    throw new EmmettError({
      errorCode: 409,
      message: 'Shopping Cart is not opened',
    });

  return { ...state, status: 'Cancelled', cancelledAt: command.now };
};
```

`ShoppingCart` gets `status: 'Opened' | 'Confirmed' | 'Cancelled'` and `cancelledAt?: Date`. `addProductItem` rejects any existing cart that isn't `Opened` (today it only rejects `Confirmed`). `confirm` rejects a `Cancelled` cart with 409. `removeProductItem` already requires `Opened`.

## Now, step 1: the same specs in both samples

Both samples pass the same 35 integration cases today (D1: 14 unit, 35 integration, 6 e2e; DO: 14, 35, 3; all green on 2026-09-19). The unit specs and business logic are identical files. This step changes only specs, and every suite stays green.

```text
Make the specs of samples/cloudflare/d1 and samples/cloudflare/durable-objects identical. Change only spec files; all suites must stay green.

- src/shoppingCarts/api.int.spec.ts: use the D1 spec as the base: its it.each groups, test names and helpers. The two files may differ only in the imports, the describe name, givenApi, and D1's beforeAll migration. The missing-cart eTag becomes the same value in both.
- src/shoppingCarts/api.e2e.spec.ts: the shopping-cart tests are identical in both. D1 keeps its three migration tests on top.
- businessLogic.unit.spec.ts is already identical; keep it so.

Verify: from each sample directory run npm run test:unit, npm run test:int, npm run test:e2e and npm run agent:check. Then diff the two api.int.spec.ts files and list every remaining difference in your report.
```

## Now, step 2: one change, both samples

```text
Simplify samples/cloudflare/d1 and samples/cloudflare/durable-objects in one change. Read plan.md first: "Decided" and "Target code" define the shape. Both samples keep identical specs; make every spec change in both.

Work test-first: make the spec changes below in both samples, run them, confirm they fail for the expected reason, then change the code.

Specs first:
1. Weak ETags: in "starts a shopping cart by adding the first product", assert the ETag is exactly W/"1". The missing-cart eTag becomes W/"1".
2. Location only on 201. Every write answers with the cart, so a test reads the cart's id from the body: 201 with Location and body when a cart is opened, 200 with body otherwise.
3. Cancel is POST /clients/:clientId/shopping-carts/:shoppingCartId/cancel with If-Match:
   - "cancels an opened shopping cart": 200 with the cancelled cart and a new ETag.
   - "allows a client to safely retry cancellation": cancelling again with the latest ETag returns 200 and the same ETag.
   - "does not add products to a cancelled shopping cart": 409 (was 404).
   - Cancel joins the "does not allow another client to ..." cases (404). Delete "does not reveal another client's shopping cart during cancellation".
   - Cancel joins the "does not ... when the shopping cart does not exist" cases (404).
   - Add "stops treating a cancelled shopping cart as active" (GET current → 404) and "starts a new shopping cart after cancelling the previous one" (201), mirroring the confirm tests.
   - "does not cancel an out-of-date shopping cart" stays 412.
4. Add "rejects a malformed request body": invalid JSON with Content-Type application/json → 400.
5. businessLogic.unit.spec.ts: cancel sets status Cancelled and cancelledAt; cancelling a cancelled cart returns it unchanged; cancelling a confirmed cart throws 409; adding to, removing from and confirming a cancelled cart throw 409.
6. Integration specs: ApiE2ESpecification.for({ getApplication: () => getApplication({ apis: [shoppingCartApi({ ... })] }) }) as in plan.md. Delete the fetch closures, the second pongoClient in the D1 spec, and the copied price table (import getUnitPrice).
7. E2E specs: ApiE2ESpecification.for({ getApplication: () => exports.default }).

Wiring:
- D1: src/pongo.ts exports one pongoDb, built with env from 'cloudflare:workers' and errors: { throwOnOperationFailures: true }. index.ts builds the APIs as in plan.md.
- DO: index.ts passes env.SHOPPING_CARTS to shoppingCartApi and still exports ShoppingCartDurableObject.
- shoppingCartApi and migrationsApi take one object with named dependencies and return WebApiSetup. They never read env or context.env. No Bindings type parameters.
- Types: add --strict-vars=false to the types:cloudflare script and regenerate worker-configuration.d.ts, so ENVIRONMENT is typed as string. In D1's env.d.ts, declare MIGRATION_TOKEN?: string on Cloudflare.Env. Delete the Bindings type in index.ts.
- Move the price table and getUnitPrice to src/shoppingCarts/pricing.ts; getUnitPrice throws ValidationError('Unknown product'). Delete resolveUnitPrice.
- D1 migrations/api.ts: delete the try/catch; Emmett's middleware already returns 500 with problem details.

Routes (both samples):
- One operation per statement. Calls with several values take one object with named fields.
- Params: context.req.param(). Delete routeIds and requiredIdentifier.
- Body: productItemBody with Hono's validator('json', ...), as in plan.md; routes read context.req.valid('json'). Delete productItemRequest. If malformed JSON comes back as 500 because Emmett's middleware doesn't map Hono's HTTPException, stop and report.
- If-Match: assertUnsignedBigInt(getETagValueFromIfMatch(context)) on every mutation. Delete expectedVersionFromIfMatch and optionalExpectedVersionFromIfMatch.
- Responses: OK, Created, NotFound from @event-driven-io/emmett-honojs, with eTag: toWeakETag(_version) and the cart as body. Location only on 201, via Created({ context, url: shoppingCartUrl(cart), body, eTag }). Every other write returns OK({ context, body, eTag }). Delete noContentAt, cartResponse, setCartETag, documentVersion, toResponse and requiredDocument.
- Mutation routes contain no decisions: D1 calls handle with the business function; DO calls the Durable Object method. The temporary findOne and NotFoundError throw from plan.md "Mutation on an existing cart (Now, temporary)" sit in the D1 route body and in the DO method.
- Reads: no query functions. D1's GET routes do findOne and throw NotFoundError when it finds nothing; in the DO, the getById and getCurrent methods do it. /:shoppingCartId reads by _id (and clientId in D1); /current reads by clientId and status 'Opened'.
- Replace the DELETE cancel route with POST .../cancel.

D1 only:
- Delete handleOwnedCart, assertOwnedCart and its type.
- Open-cart route: replace while (true) with asyncRetry from @event-driven-io/emmett as in plan.md. No try/catch around it.

DO only:
- Durable Object methods take one object with named fields: confirm, cancel, addProductItem, removeProductItem, addProductItemToCurrent, getCurrent, getById. They throw NotFoundError for a missing cart instead of returning null. Delete #handleExistingCart once each method has its own findOne and handle.
- Delete the undefined-version branch of cancel.
- The route wraps addProductItemToCurrent in the same asyncRetry as D1.

Verify from each sample directory: npm run test:unit, npm run test:int, npm run test:e2e, npm run agent:check. Only the assertions listed under "Specs first" may change. If any other assertion has to change, the code changed behaviour: stop and report. Diff the two api.int.spec.ts files at the end; only the allowed differences from step 1 may remain. businessLogic.ts, shoppingCart.ts and businessLogic.unit.spec.ts must be identical files in both samples; check with diff -q.

If env from 'cloudflare:workers' is not available when the Vitest pool imports src/pongo.ts, stop and report instead of working around it.
```

## Findings from step 2

**DO test output: workerd logs every error an RPC method throws.** Not documented as intended anywhere: Cloudflare's RPC error-handling page covers propagation only, and the vitest known-issues page doesn't mention it. workers-sdk #7707 reports errors from DO RPC in vitest as noise and is open in the backlog; #11031 is the related isolated-storage failure, closed by #11632. `npm run test:int` prints `uncaught exception; source = Uncaught (in promise)` once per error thrown inside the Durable Object, now 17 lines. The line comes from workerd itself: a 30-line repro with no sample or Pongo code prints it for an `async` throw, a sync throw and a returned rejection, even though the caller catches every one. Plain `wrangler dev`, without the vitest plugin, prints the same as `✘ [ERROR] Uncaught Error: …`. Whether a deployed Worker logs it is unverified. Options: report it upstream; have the DO methods return errors as values, which adds code to every method; or accept the lines and assert them.

**The vitest plugin lets one Durable Object's requests interleave.** Its RPC wrapper awaits between calls (`@cloudflare/vitest-plugin/dist/worker/lib/cloudflare/test-internal.mjs:360-405`), so two concurrent first requests for one client can both pass `findOne` before either writes. Real workerd does not: 500 of 500 concurrent pairs under `wrangler dev` were clean. The retry in the API layer covers it either way.

**Errors lose their prototype across a Durable Object RPC call.** They arrive as a plain `Error` with own properties kept: `errorCode`, `errorType`, plus `durableObjectId` and `remote`. So `instanceof` fails and `DumboError.isInstanceOf(error, { errorType })` is the way to recognise them. Emmett's problem-details mapping still works, because it reads `errorCode`.

**Emmett's test agent can't send malformed JSON.** It always sets `Content-Type: application/json` and runs `JSON.stringify` on the body, so "rejects a missing request body" is the malformed-JSON case, and no separate test can be added.

**`assertNotEmptyString` accepts a blank string.** The old `requiredIdentifier` rejected `'  '`; the Emmett assert accepts it. No spec covers it. See E6.

## Needs Emmett

E5 is confirmed and blocks one test in both samples. Every item applies to both `emmett-honojs` and `emmett-expressjs`, so the two stay in parity.

- **E1. `asyncRetry` defaults.** `asyncRetry` passes options straight to `async-retry`, and the `retry` package fills in `minTimeout: 1000, factor: 2`. With only `{ retries: 3 }`, a caller waits 1–2 s, then 2–4 s, then 4–8 s. Emmett's own call sites all set `minTimeout`.
- **E2. `undefined` timeouts.** The processor lock (`processors.ts:505-510`) passes `minTimeout: policy.minTimeout` and `maxTimeout: policy.maxTimeout`, both optional. `undefined` overwrites the library defaults, the delay becomes `NaN`, Node prints `TimeoutNaNWarning`, and retries run 1 ms apart (measured: 4 attempts in 5 ms).
- **E3. `assertUnsignedBigInt`.** It passes its input straight to `BigInt`, so a malformed `If-Match`, or a strong one like `"3"`, gives a `SyntaxError` and a 500.
- **E4. `assertPositiveInteger`** next to `assertPositiveNumber`. It replaces the samples' `positiveInteger`.
- **E5 (confirmed). Framework HTTP errors become 500.** `defaultErrorToProblemDetailsMapping` reads only `errorCode`. Hono's validator throws `HTTPException(400, 'Malformed JSON in request body')` (`hono/dist/validator/validator.js:20-21`), which carries `status`, so the response is 500. Both samples fail "rejects a missing request body" because of it. Express's mapping (`emmett-expressjs/src/middlewares/problemDetailsMiddleware.ts:24-47`) reads only `errorCode` too, and body-parser's malformed-JSON `SyntaxError` carries `status`/`statusCode`, so it has the same gap.
- **E6. `assertNotEmptyStringOrWhitespace`.** `assertNotEmptyString` only checks `value.length === 0` (`emmett/src/validation/index.ts:19-24`), so `'  '` passes, which is right for its name. Add a second assert that also rejects whitespace-only strings, for identifiers like the samples' `productId`.
- **E7. Test assertions the samples write by hand.** Every expectation should be data passed to `expectResponse`. These can't be:
  - a header that must be absent: `expectResponse`'s `headers` is typed `{ [index: string]: string }`, although `isSubset` already treats an expected `undefined` as "not there" (`assertions.ts:11-24`). Widening the type to `string | undefined` is enough to assert that a 200 answer carries no `Location`;
  - a header matched by pattern, for `Location` on 201, or compared against another value ("not the previous cart's URL"). Allow a `RegExp` or a predicate as a header value;
  - an empty body: the samples call `response.text()` themselves;
  - one of several statuses, for the concurrent-carts test, which has a local `expectOneOf`;
  - an ETag that is present and differs from the previous one, the samples' `expectCapturedETag` and `expectChangedETag`.

```text
In the Emmett repo, make these changes. Test-first, no breaking changes for valid input.

1. src/packages/emmett/src/utils/retry.ts: when asyncRetry gets options, use minTimeout: 100 and factor: 1.5 unless the caller sets them (the values handleCommand.ts already uses). Test: one failure followed by success with { retries: 3 } finishes in well under a second.

2. Same file: drop option keys whose value is undefined before calling async-retry, so { minTimeout: undefined } falls back to the defaults instead of NaN. Test: { retries: 3, minTimeout: undefined, maxTimeout: undefined } waits between attempts and emits no TimeoutNaNWarning. Add a test in processors for a retry lock policy without timeouts.

3. src/packages/emmett/src/validation: assertUnsignedBigInt throws ValidationError for any input that isn't an unsigned integer. Reject 'abc', '', '1.5', '"3"', '-1'; accept '0', '12', 12, 12n.

4. Same folder: add assertPositiveInteger next to assertPositiveNumber. It returns the number and throws ValidationError for non-numbers, NaN, non-integers and values <= 0.

5. src/packages/emmett-honojs: write a test that sends malformed JSON to a route guarded by Hono's validator('json', ...) and expects 400 problem details. It returns 500 today. Make defaultErrorToProblemDetailsMapping read the status of an error that carries one (Hono's HTTPException has status), keeping errorCode first. Do the same in src/packages/emmett-expressjs, where express.json() rejects malformed JSON with a SyntaxError carrying status 400, with its own test.

6. src/packages/emmett/src/validation: add assertNotEmptyStringOrWhitespace next to assertNotEmptyString. It returns the value and throws ValidationError for non-strings, '' and whitespace-only strings such as '  ' and '\t'. Leave assertNotEmptyString as it is.

7. Testing helpers in src/packages/emmett-honojs/src/testing and src/packages/emmett-expressjs/src/testing, with the same API in both. expectResponse takes headers typed string | undefined | RegExp | ((value: string | undefined) => boolean): undefined asserts the header is absent, which isSubset already supports at runtime. Add an option for an empty body, a way to accept one of several statuses, and ETag assertions for "present" and "different from this value". Test each against a small app, then use them in the Cloudflare samples to replace their local expectOneOf, expectCapturedETag, expectChangedETag and the raw response.text() and headers.location checks.

Every change above applies to emmett-honojs and emmett-expressjs alike, so the two frameworks behave the same.
```

## Needs Pongo

- **P1. SQLite insert.** `insertOne` and `insertMany` in `src/packages/pongo/src/storage/sqlite/core/sqlBuilder/index.ts` (lines 51 and 67) use `INSERT OR IGNORE`, so any broken constraint silently skips the row, and Pongo reports it as "not inserted" (`ConcurrencyError` with the flag on). Change both to `INSERT INTO ... VALUES ... ON CONFLICT(_id) DO NOTHING RETURNING _id`, as the PostgreSQL builder does. Dumbo already maps SQLite's and D1's `UNIQUE constraint failed` to `UniqueConstraintError`. sqlite3, D1 and the DO driver all use this builder.
- **P2. Typed version.** When the handler returns a document, `handle`'s `result.document` is typed with `_version`. It already carries `_version` at runtime.
- **P4. `db()` without a name silently drops the schema.** `client.db()` resolves to the driver's `defaultDatabaseName` (`'main'` for SQLite, `sqliteMetadata.ts:6`), but a client schema registers its database under its property key, `database` in the samples. `getDatabaseDefinition` finds nothing for `'main'` (`pongoDatabaseCache.ts:52-58, 116`), so the database is built with no schema: `migrate()` creates nothing, the collection's table appears only through `ensureCollectionCreated`, and declared indexes never exist. Nothing warns. In the DO sample this silently dropped the one-open-cart unique index; the sample now uses `client.database`. A database declared as `pongoSchema.db({ collections })`, without a name, is the default one: its `databaseName` is `undefined` (`schema/index.ts:356-390`). So `db()` with no name should use the declared default database, not look for a declaration named after the driver's fallback. Fail loudly when a schema is declared, no name is given and there is no default.
- **P5. A given/when/then specification for `handle`.** Emmett has `DeciderSpecification` for event-sourced deciders (`emmett/src/testing/deciderSpecification.ts`). Pongo needs the same for documents, in two shapes: one that runs the handler over a given state with no database, and one that runs a real `handle` against a collection and checks the stored document. The samples show why: their unit spec calls the business functions directly, and their integration tests go through HTTP, so nothing tests `handle` itself.
- **P3. `handle` by filter.** Today `handle` takes ids, fetches them with `fetchByIds`, and for each id decides by whether the document existed: replace with its version, insert, or delete (`handle.ts:125-167`). With a filter, it fetches by the filter instead, and each match goes through the same per-document path. When nothing matches, the handler gets `null`, and the document it returns is inserted with `_id ?? uuid()`, as `insertOne` does (`pongoCollection.ts:468`). A version mismatch stays `ConcurrencyError`, and the handler isn't called for it. Two callers racing on a filter that matches nothing insert different ids, so a unique index stops the second; in the samples that's the one-open-cart index, which gives `UniqueConstraintError` after P1.

```text
In the Pongo repo, make five changes. Test-first.

1. src/packages/pongo/src/storage/sqlite/core/sqlBuilder/index.ts: insertOne and insertMany use INSERT OR IGNORE, which skips a row that breaks any constraint, so a violated custom unique index is reported as "not inserted" instead of throwing. Use INSERT INTO ... VALUES ... ON CONFLICT(_id) DO NOTHING RETURNING _id, as the PostgreSQL builder does. Tests, on every SQLite backend the existing insert and handle tests run on (sqlite3, D1, Durable Object):
   - inserting a document with an existing _id reports it as not inserted, as today (ConcurrencyError with throwOnOperationFailures);
   - inserting a document that breaks another unique index throws UniqueConstraintError, for insertOne, insertMany and handle;
   - the same test on PostgreSQL passes unchanged.

2. PongoHandleResult: when the handler returns a document, type result.document as WithIdAndVersion<T>, so callers read _version without a cast. toHandleResult in src/packages/pongo/src/core/collection/handle.ts already returns _version for insert, replace and no-op.

3. collection.handle accepts a filter, e.g. handle({ clientId, status: 'Opened' }, handler) or handle({ _id, clientId, expectedVersion }, handler). Fetch by the filter instead of fetchByIds; handle each matched document through the existing per-document path in handle.ts (version check first, handler not called on a mismatch, then replace, delete or no-op). When nothing matches, call the handler with null and insert what it returns with _id ?? uuid(), as insertOne does. A version mismatch, including an expected version with no match, stays ConcurrencyError. Keep id and id-array inputs working unchanged. Tests, on every backend the existing handle tests run on:
   - a filter matching one document replaces it;
   - a filter matching one document with a stale expectedVersion reports a version mismatch and doesn't call the handler;
   - a filter matching nothing inserts the handler's document, generating _id when the handler didn't set one;
   - a filter with _id and another field doesn't touch a document whose other field differs;
   - a filter matching several documents handles each of them;
   - two concurrent handles with a filter matching nothing, on a collection with a unique index on the filtered field: one inserts, the other fails with UniqueConstraintError.

4. client.db() with no name resolves to the driver's defaultDatabaseName ('main' for SQLite), so a schema declared as pongoSchema.db({ collections }) is not found (pongoDatabaseCache.ts getDatabaseDefinition). The database is then built without a schema: migrate() creates nothing declared and custom indexes never exist, silently. A database declared without a name is the default one, with databaseName undefined. Make db() with no name use that declared default database instead of matching the driver's fallback name. Tests: db() on a client whose schema declares an unnamed database creates its collections and indexes on migrate(); db() when the schema declares only named databases and no default fails with a PongoError; db('name') keeps resolving by name; a client with no schema keeps working as today.

5. Add a given/when/then specification for collection.handle, modelled on Emmett's DeciderSpecification (src/packages/emmett/src/testing/deciderSpecification.ts). Two shapes with one API: a state-based one that runs the handler over a given document state without a database, asserting the returned document, "nothing changed", or a thrown error; and an integration one that runs handle against a real collection on every supported backend, asserting the stored document and its version, including a version mismatch. Cover both with their own tests, and use the state-based one in at least one existing Pongo test to show the shape.

Run npm run test:unit and the relevant integration tests from src, then npm test before handing over.
```

## Follow-up once Emmett and Pongo are released

```text
Emmett (asyncRetry defaults, assertUnsignedBigInt, assertPositiveInteger, and E5 if it was needed) and Pongo (SQLite insert, typed handle document, handle by filter) are released. Bump @event-driven-io/emmett, @event-driven-io/emmett-honojs, @event-driven-io/dumbo and @event-driven-io/pongo in samples/cloudflare/d1 and samples/cloudflare/durable-objects, then remove what the releases made unnecessary:

- Open-cart route and the DO's addProductItemToCurrent: call handle({ clientId, status: 'Opened' }, handler) directly; delete the findOne. D1 keeps asyncRetry with retries: 3 and shouldRetryError for ConcurrencyError and UniqueConstraintError, without minTimeout and factor.
- Delete the WithIdAndVersion casts on handle results.
- Replace positiveInteger with assertPositiveInteger; the remove route passes Number(context.req.query('quantity')).
- Keep the temporary findOne before handle in mutation routes until "Open, last" in plan.md is decided.

Verify from each sample directory: npm run test:unit, npm run test:int, npm run test:e2e, npm run agent:check. No assertion should change: this only removes code.
```

Once "Open, last" is decided: D1's mutation routes call `handle({ _id, clientId, expectedVersion }, ...)` and the DO's methods call `handle({ _id, expectedVersion }, ...)` directly, as in "Mutation on an existing cart (end state)". The temporary `findOne` goes.

## Open, last

Discuss after everything else is done.

A mutation with `If-Match` on a missing cart, or on another client's cart. Example: `POST /clients/c2/shopping-carts/abc/confirm` with `If-Match: W/"3"`, where `abc` doesn't exist or belongs to `c1`. With `handle({ _id: 'abc', clientId: 'c2', expectedVersion: 3n })`, nothing matches, and `handle` reports a version mismatch before calling the handler (`handle.ts:156-157`), which gives 412. Today's specs expect 404, and RFC 9110 §13.2.1 says a server MUST ignore preconditions when the request without them would fail with something other than 2xx or 412, so 404 wins.

Options (no second database call):

1. `handle` reports "nothing matched" separately from "wrong version". It already knows at line 156: `existing` is `null` in the first case.
2. The API answers 412 for these cases. Four spec cases change from 404 to 412.

## Not doing

- **A generic `WebApiSetup` and `env` in Emmett's test `fetch`.** Not needed once dependencies are injected.
- **An extra application layer in D1.** Routes call `handle` directly.
- **A `decide` function or a single generic `handle` RPC in the Durable Object.** They move code around without making it simpler.
