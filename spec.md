# Cloudflare SQLite shopping-cart samples

## Summary

Add two standalone Cloudflare Worker samples showing Pongo's SQLite drivers through the same realistic shopping-cart API:

- `samples/cloudflare/d1` uses Cloudflare D1.
- `samples/cloudflare/durable-objects` uses Durable Object SQLite.

Both samples use Hono, keep their own local copy of the domain code, and demonstrate document writes and queries. The domain follows the supplied shopping-cart article and the approachable progression of Emmett's Getting Started guide, but it is deliberately not event sourced. Business functions receive the current shopping-cart document and return the next document or `null`; Pongo's `collection.handle(id, handler)` maps those results to insert, replace, delete, or no-op behavior.

The samples must remain small enough to read in one sitting. Their purpose is to teach Pongo's Cloudflare integration and document-oriented command handling, not to become a complete commerce platform.

## Researched Cloudflare baseline

Use Cloudflare's current Workers toolchain rather than copying older examples from the repository:

- Use ES module Workers configured by a checked-in `wrangler.jsonc`. Cloudflare currently recommends JSON configuration as the source of truth for new projects.[^1]
- Pin Wrangler to the version selected during implementation and pin a tested `compatibility_date`; regenerate the checked-in binding/runtime types whenever that date or the bindings change.
- Use `@cloudflare/vitest-plugin` with Vitest 4.1 or newer. This package replaced `@cloudflare/vitest-pool-workers` in August 2026 and runs tests inside the Workers runtime with local bindings.[^2]
- Invoke the configured Worker's default export through `exports.default.fetch()` for black-box HTTP integration tests. This covers the actual Worker entry point and bound D1 or Durable Object resources.[^3]
- For a new Durable Object namespace, use the declarative Wrangler `exports` field with `storage: "sqlite"`. This is the current replacement for the legacy tagged `migrations/new_sqlite_classes` configuration.[^4]
- Keep local state under Wrangler's default `.wrangler/state` directory and ignore it in Git. Local resources are separate from production resources.[^5]

Resolve dependencies from the latest mutually compatible releases when implementation starts, then commit each standalone sample's lockfile. As researched on 2026-09-12, the concrete baseline is Node 24.12.0, Wrangler 4.131.1, `@cloudflare/vitest-plugin` 1.1.8, `@cloudflare/workers-types` 5.20260911.1, Vitest 4.1.11, Hono 4.13.7, Pongo 0.17.0-beta.52, Dumbo 0.13.0-beta.52, `actions/checkout` 7.0.1, `actions/setup-node` 7.0.0, and `cloudflare/wrangler-action` 4.0.0. Vitest 5.0.0 is newer but is outside the plugin's `^4.1.0` peer range, so it must not be selected until Cloudflare declares support. The Pongo and Dumbo `beta` tags are newer than their accidentally malformed `latest` tags (`betabeta.50`), so install the explicit `.52` beta versions rather than `@latest`. Recheck these facts during implementation with `npm view`; dependency freshness never overrides a declared peer incompatibility.

## Implementation baseline: copy, then adapt

Do not create the sample layout or project tooling from memory. Use two concrete starting points:

1. Generate a temporary current Hono Workers project with Cloudflare's official setup and use its Worker-facing files as the baseline.[^10]
2. Copy the shopping-cart slice and repository tooling from `/home/oskar/Repos/emmett/samples/webApi/honojs-with-postgresql`, then adapt it from event sourcing and PostgreSQL to Pongo document handling and Cloudflare SQLite.

As verified with `create-cloudflare` 2.72.7 on 2026-09-13, the reference scaffold command is:

```shell
npx create-cloudflare@latest pongo-cloudflare-hono-reference --framework=hono --platform=workers --no-deploy --no-git --no-agents
```

Run that in a temporary directory during implementation. It delegates to the official `cloudflare-workers` Hono template, installs the current Wrangler version, sets the compatibility date, and generates `worker-configuration.d.ts`. The checked-in samples do not ask users to rerun the generator. Do not retain its static `public/` directory, asset binding, example route, deployment script, or `pnpm-workspace.yaml`; these samples are npm-based JSON APIs deployed only by GitHub Actions.

Use this copy/adapt map for both samples:

| Final concern                                                                                                          | Concrete source                                                                                                                         | Required action                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hono Worker entry point, `wrangler.jsonc`, base `package.json`, base `tsconfig.json`, `.gitignore`, generated bindings | Temporary Cloudflare Hono Workers scaffold                                                                                              | Copy, then replace the example route/assets with the bindings and code specified here. Keep the generated type workflow.                                                                                                                                                       |
| Shopping-cart source shape                                                                                             | `emmett/samples/webApi/honojs-with-postgresql/src/shoppingCarts/`                                                                       | Copy only `index.ts`, `shoppingCart.ts`, `businessLogic.ts`, `businessLogic.unit.spec.ts`, `api.ts`, `api.int.spec.ts`, and `api.e2e.spec.ts`; adapt them as described below. Do not copy projections, summaries, observability, Docker, the test stack, or event-store setup. |
| Pongo schema configuration                                                                                             | `Pongo/samples/simple-ts/src/pongo.config.ts`                                                                                           | Copy its `pongoSchema` configuration style into each sample's `src/pongo.config.ts`, replace `User` with `ShoppingCart`, and add the specified index. There is no separate `schema.ts`.                                                                                        |
| EditorConfig, Node version, Prettier                                                                                   | `emmett/samples/webApi/honojs-with-postgresql/{.editorconfig,.nvmrc,.prettierrc.json,.prettierignore}`                                  | Copy the first three verbatim. In `.prettierignore`, replace Docker-only entries with `.wrangler/`, `dist/`, and `coverage/`.                                                                                                                                                  |
| ESLint                                                                                                                 | `emmett/samples/webApi/honojs-with-postgresql/eslint.config.mjs`, with the current type-import rules from `Pongo/src/eslint.config.mjs` | Preserve the flat, type-checked TypeScript and Prettier setup. Add the current `consistent-type-imports` and `no-import-type-side-effects` rules. Change only ignores and runtime globals for the Cloudflare project; do not copy Pongo package-boundary rules.                |
| VS Code extensions and test debugging                                                                                  | `Pongo/.vscode/extensions.json` and `Pongo/.vscode/launch.json`                                                                         | Copy the extensions list. Copy the Vitest launch configuration, then remove the repository-specific `/src` segments so its program and working directory point at the standalone sample.                                                                                       |
| VS Code formatting settings and tasks                                                                                  | `emmett/samples/webApi/honojs-with-postgresql/.vscode/settings.json` and `.vscode/tasks.json`                                           | Keep the formatting, ESLint, LF, and relative-import settings. Remove the Node test-runner block. Replace tasks with the sample's actual `dev`, `test`, and `build:ts:watch` npm scripts; do not keep commands the package does not provide.                                   |
| Cloudflare Vitest setup                                                                                                | `Pongo/src/vitest.cloudflare.config.ts` plus the generated Cloudflare test setup                                                        | Adapt the existing `cloudflareTest({ wrangler: { configPath } })` pattern to each standalone sample. Tests remain beside the source files copied from Emmett.                                                                                                                  |
| GitHub Actions                                                                                                         | `/home/oskar/Repos/emmett/.github/workflows/build_and_test_sample_webapi-expressjs-with-esdb.yml`                                       | Copy its sample workflow shape, then replace the sample path, Docker/external-service work, commands, and deployment job with the exact Cloudflare steps in this specification.                                                                                                |

The two final samples deliberately duplicate these adapted files so each remains standalone. When a copied source contains Node, PostgreSQL, EventStore, projection, OpenTelemetry, or Emmett-specific code, delete that code rather than wrapping it in a compatibility abstraction.

## Goals

- Show a useful D1-backed Pongo application with writes, indexed queries, migrations, validation, and concurrency protection.
- Show an actor-like Durable Object design aligned with Cloudflare's model: a front-door Worker routes all operations for one client to one Durable Object instance.
- Use the same HTTP contract and shopping-cart behavior in both samples so the storage designs are easy to compare.
- Demonstrate Pongo's `handle` flow for creating, updating, deleting, and safely doing nothing.
- Model a cart as one self-contained document with embedded product lines, captured prices, and denormalized totals.
- Show one active cart per client and support multiple successive carts over time.
- Include focused tests, runnable HTTP examples, documentation, and dedicated CI workflows.

## Non-goals

- Event sourcing, events, `evolve`, projections, or Emmett command-handling abstractions.
- Orders, checkout sessions, payment processing, inventory reservation, authentication, or authorization.
- A cart-history/list endpoint without a concrete UI or business use case.
- Cross-client queries in the Durable Object sample.
- A shared package between samples.
- A production product catalogue or a configured third Worker.
- A general repository abstraction or an invented domain concept such as `ShoppingCartOwner`.
- A third Node.js/`sqlite3` sample.

## Shared domain

Each sample contains the same local copy of the shopping-cart code. Preserve the naming and colocated test structure from the Emmett Hono sample instead of introducing a generic `domain.ts`:

- `src/shoppingCarts/shoppingCart.ts` contains only the document types.
- `src/shoppingCarts/businessLogic.ts` contains the command input types and four pure functions.
- `src/shoppingCarts/businessLogic.unit.spec.ts` calls those functions directly with Vitest.
- `src/shoppingCarts/api.ts` contains the Hono routes and Pongo orchestration.
- `src/shoppingCarts/api.int.spec.ts` and `api.e2e.spec.ts` stay beside `api.ts`.
- `src/shoppingCarts/index.ts` exports only the shopping-cart API entry point used by the Worker. Feature-internal business functions and document types use direct imports and are not re-exported through the barrel.

Start `shoppingCart.ts` by copying the corresponding Emmett file. Delete all event types, `initialState`, `evolve`, `Map`, and empty/closed state unions. Replace them with the document model from the supplied article:

```ts
export type ProductItem = Readonly<{
  productId: string;
  quantity: number;
}>;

export type PricedProductItem = Readonly<
  ProductItem & {
    unitPrice: number;
  }
>;

export type ProductItems = ReadonlyArray<PricedProductItem>;

const findProductItem = (
  productItems: ProductItems,
  productId: string,
): PricedProductItem | undefined =>
  productItems.find((productItem) => productItem.productId === productId);

export const ProductItems = {
  find: findProductItem,

  withUpdatedQuantity(
    productItems: ProductItems,
    productItem: PricedProductItem,
    quantityChange: number,
  ): ProductItems {
    const currentProductItem = findProductItem(
      productItems,
      productItem.productId,
    );

    if (!currentProductItem)
      return [...productItems, { ...productItem, quantity: quantityChange }];

    const quantity = currentProductItem.quantity + quantityChange;
    if (quantity === 0)
      return productItems.filter(
        ({ productId }) => productId !== productItem.productId,
      );

    return productItems.map((current) => {
      if (current.productId !== productItem.productId) return current;

      return { ...current, quantity };
    });
  },
};

export type ShoppingCart = Readonly<{
  _id: string;
  clientId: string;
  productItems: ProductItems;
  productItemsCount: number;
  totalAmount: number;
  status: "Opened" | "Confirmed";
  openedAt: Date;
  confirmedAt?: Date;
}>;
```

Start `businessLogic.ts` by copying the corresponding Emmett file. Delete the Emmett imports, event-returning types, `decide`, `decider`, and metadata wrappers. Keep the recognizable operation names from the article and export these exact contracts:

```ts
import { ProductItems } from "./shoppingCart";
import type { PricedProductItem, ShoppingCart } from "./shoppingCart";

export type AddProductItemToShoppingCart = Readonly<{
  type: "AddProductItemToShoppingCart";
  data: Readonly<{
    clientId: string;
    shoppingCartId: string;
    productItem: PricedProductItem;
    now: Date;
  }>;
}>;

export type RemoveProductItemFromShoppingCart = Readonly<{
  type: "RemoveProductItemFromShoppingCart";
  data: Readonly<{
    productId: string;
    quantity: number;
  }>;
}>;

export type ConfirmShoppingCart = Readonly<{
  type: "ConfirmShoppingCart";
  data: Readonly<{ now: Date }>;
}>;

export type CancelShoppingCart = Readonly<{
  type: "CancelShoppingCart";
  data: Readonly<Record<string, never>>;
}>;

export type ShoppingCartCommand =
  | AddProductItemToShoppingCart
  | RemoveProductItemFromShoppingCart
  | ConfirmShoppingCart
  | CancelShoppingCart;

export const addProductItem = (
  command: AddProductItemToShoppingCart["data"],
  state: ShoppingCart | null,
): ShoppingCart => {
  if (state?.status === "Confirmed")
    throw new Error("Shopping Cart already closed");

  const shoppingCart = state ?? {
    _id: command.shoppingCartId,
    clientId: command.clientId,
    productItems: [],
    productItemsCount: 0,
    totalAmount: 0,
    status: "Opened" as const,
    openedAt: command.now,
  };

  const currentProductItem = ProductItems.find(
    shoppingCart.productItems,
    command.productItem.productId,
  );
  const unitPrice =
    currentProductItem?.unitPrice ?? command.productItem.unitPrice;

  return {
    ...shoppingCart,
    productItems: ProductItems.withUpdatedQuantity(
      shoppingCart.productItems,
      command.productItem,
      command.productItem.quantity,
    ),
    productItemsCount:
      shoppingCart.productItemsCount + command.productItem.quantity,
    totalAmount:
      shoppingCart.totalAmount + unitPrice * command.productItem.quantity,
  };
};

export const removeProductItem = (
  command: RemoveProductItemFromShoppingCart["data"],
  state: ShoppingCart | null,
): ShoppingCart => {
  if (state?.status !== "Opened")
    throw new Error("Shopping Cart is not opened");

  const currentProductItem = ProductItems.find(
    state.productItems,
    command.productId,
  );
  if (!currentProductItem || currentProductItem.quantity < command.quantity)
    throw new Error("Not enough products in shopping cart");

  return {
    ...state,
    productItems: ProductItems.withUpdatedQuantity(
      state.productItems,
      currentProductItem,
      -command.quantity,
    ),
    productItemsCount: state.productItemsCount - command.quantity,
    totalAmount:
      state.totalAmount - currentProductItem.unitPrice * command.quantity,
  };
};

export const confirm = (
  command: ConfirmShoppingCart["data"],
  state: ShoppingCart | null,
): ShoppingCart => {
  if (!state) throw new Error("Shopping Cart is not opened");
  if (state.status === "Confirmed") return state;
  if (state.productItemsCount === 0) throw new Error("Shopping Cart is empty");

  return {
    ...state,
    status: "Confirmed",
    confirmedAt: command.now,
  };
};

export const cancel = (state: ShoppingCart | null): ShoppingCart | null => {
  if (state?.status === "Confirmed")
    throw new Error("Cannot cancel confirmed Shopping Cart");
  return null;
};
```

These are not placeholders for another abstraction. Implement their bodies directly from the supplied article with only the explicitly listed corrections below. The document types, command envelopes, command data, embedded lines, and arrays are readonly. `ProductItems.withUpdatedQuantity` follows the organization of the Emmett sample's helper: adding passes a positive quantity change and removing passes a negative one. Each operation returns a new document rather than mutating the state passed by Pongo; an idempotent operation may return the unchanged state reference. `api.ts` passes command `data` to operations that consume it inside `shoppingCarts.handle(...)`; `cancel` receives only the state because it needs no command data. There is no command bus, repository, service class, decider, event, or `evolve` function.

Treat monetary values as integer minor units in sample catalogue data and explain this in the README. Each product ID has one embedded line in a cart. The line captures its unit price when first added; later additions of the same product increase quantity at that captured price for the lifetime of the cart. Clients never submit a trusted price. This explicit price-lock policy avoids ambiguous duplicate lines if a production catalogue price changes while a cart is open.

The whole cart is the document consistency boundary:

- Product lines are embedded because they are read and changed with their cart.
- `productItemsCount` and `totalAmount` are stored denormalized values and updated with the product lines.
- The permanent cart ID is generated by the Worker when the first item opens a new cart.
- A cart is never copied between a special `current` document and an archive document.
- An active cart is a stored cart with the matching `clientId` and `status: 'Opened'`.
- At most one active cart may exist for a client.

Implement these domain operations:

### Add a product item

- Accept `clientId`, `shoppingCartId`, a server-priced product item, and `now`.
- When state is `null`, create an opened cart containing no lines, then add the requested item.
- Reject additions to a confirmed cart.
- Match product lines by `productId`. When one exists, retain its captured `unitPrice` and increase its quantity; otherwise append a new server-priced embedded line.
- Update `productItemsCount` and `totalAmount`.
- Return the new or updated cart document.

The first addition is therefore the open-cart operation. Do not create an empty cart through a separate command.

### Remove a product item

- Require an opened cart.
- Accept a product ID and positive quantity.
- Find the embedded line in the current document rather than accepting a price from the caller.
- Reject removal when the line does not exist or its quantity is insufficient.
- Decrease the line quantity.
- Remove the line when its quantity reaches zero.
- Decrease `productItemsCount` and `totalAmount` using the line's captured price.
- Return the updated cart document.

This intentionally fixes the omission in the article snippet where the line quantity was not decremented.

### Confirm

- Return a not-found error when the cart does not exist.
- Return the unchanged document when it is already confirmed, making repeated confirmation idempotent.
- Reject confirmation of an empty cart.
- Change the status to `Confirmed`, set `confirmedAt`, and return the document.

### Cancel

- Reject cancellation of a confirmed cart.
- Return `null` for an opened or missing cart.
- Pongo deletes an existing open cart when the handler returns `null`.
- Repeated cancellation succeeds as an idempotent no-op when the document is already absent.

Confirmation and cancellation are idempotent because repeating them does not apply another state change. Adding and removing quantities are intentionally not idempotent: repeating either command applies the quantity change again. Do not add an idempotency-key store or request-deduplication abstraction to this sample.

Domain functions contain no Hono, Cloudflare, Pongo, or external-service code. They return documents, never events.

## Cart lifecycle

The normal flow uses one permanent cart identity:

1. The first product addition queries the client's active cart.
2. If none exists, the Worker generates a cart ID and `addProductItem` creates the document under that ID.
3. The response exposes the permanent cart URL through `Location`; the client retains this ID for later commands.
4. Subsequent additions, removals, confirmation, and cancellation address that permanent ID.
5. Confirmation updates the same document to `Confirmed`. It then stops matching the active-cart query.
6. Cancellation deletes the open document.
7. A later first addition finds no active cart and creates a new permanent ID.
8. `GET .../current` is a convenience and recovery query for clients that do not have the active ID. It is not a mandatory call before every mutation.

This resembles common cart APIs that return and subsequently accept a cart ID while also supporting an active-cart lookup. Stripe Checkout Sessions should only be mentioned as a separate downstream checkout/payment concept, not as the cart storage model used here.

Only the `current` product-addition route may create a document from `null`. Every ID-based addition must return `404` when the addressed cart is missing, so a stale URL cannot recreate a cancelled cart under its old ID. In both storage variants, if current-cart discovery finds an ID that cancellation deletes before the write begins, restart discovery and generate a new ID instead of recreating the stale one.

## HTTP API

Both samples expose the same public routes.

| Method   | Route                                                                                   | Purpose                                                        |
| -------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `POST`   | `/clients/:clientId/shopping-carts/current/product-items`                               | Add the first item or add to the existing active cart          |
| `GET`    | `/clients/:clientId/shopping-carts/current`                                             | Return the client's opened cart, including its permanent `_id` |
| `GET`    | `/clients/:clientId/shopping-carts/:shoppingCartId`                                     | Return a cart by permanent ID                                  |
| `POST`   | `/clients/:clientId/shopping-carts/:shoppingCartId/product-items`                       | Add an item to a known cart                                    |
| `DELETE` | `/clients/:clientId/shopping-carts/:shoppingCartId/product-items/:productId?quantity=N` | Remove a quantity of an embedded product line                  |
| `POST`   | `/clients/:clientId/shopping-carts/:shoppingCartId/confirm`                             | Confirm a known cart                                           |
| `DELETE` | `/clients/:clientId/shopping-carts/:shoppingCartId`                                     | Cancel and delete an opened cart                               |

Do not add a cart-history endpoint.

The D1 Worker additionally exposes `POST /_system/migrations` for GitHub Actions. It is not a shopping-cart endpoint. It requires `Authorization: Bearer <MIGRATION_TOKEN>`, returns `401` without the correct secret, executes `db.schema.migrate()`, and returns `204` on success. The Durable Object sample does not expose this route because there is no single database to migrate.

### Requests

Product-addition requests contain:

```json
{
  "productId": "product-1",
  "quantity": 2
}
```

Validate route parameters, JSON shape, non-empty identifiers, and positive integer quantities without adding a schema-validation dependency. `getUnitPrice(productId)` resolves the trusted price before calling `addProductItem`. Removal uses the captured price from the matching document line.

### Successful responses

- A first addition that creates a cart returns `201 Created`, no body, and `Location: /clients/{clientId}/shopping-carts/{shoppingCartId}`.
- A first-add route that finds an existing active cart returns `204 No Content`, no body, and the same ID-based `Location`.
- Later additions and confirmation return `204 No Content`, no body, and the cart's `Location`.
- Removal returns `204 No Content`, no body, and the cart's `Location`.
- Cancellation returns `204 No Content` with no body. It need not return a location because the resource was deleted.
- Queries return `200 OK` and an explicit shopping-cart response DTO as JSON. The DTO contains the domain fields, serializes dates normally, and omits Pongo's internal `_version` bigint so JSON serialization is safe.

### Errors

Return RFC 9457-style Problem Details as `application/problem+json` through a small Hono-local error mapper. Do not introduce a framework or domain abstraction for this.

- `400 Bad Request`: malformed JSON, missing fields, invalid identifiers, non-positive/non-integer quantity, or an unknown product.
- `404 Not Found`: no active cart for `GET .../current`, no matching cart for ID-based reads or additions, or confirmation of a missing cart.
- `409 Conflict`: adding to a confirmed cart, removing from a missing/non-open cart, removing an unavailable quantity, confirming an empty cart, cancelling a confirmed cart, or a D1 active-cart uniqueness conflict.

Treat a cart whose stored `clientId` differs from the route's `clientId` as not found. Repeated confirmation and cancellation return `204` as described above.

Use Hono's context response methods for `201`, `204`, JSON queries, headers, and errors. Use Emmett Hono's `ApiSpecification` in the integration tests for the fluent Given/When/Then request and response flow. Emmett remains test support and a source of presentation and domain-flow inspiration, not an application runtime dependency.

## Product catalogue boundary

Keep `getUnitPrice` in `src/index.ts`, in the same composition-root position as the copied Emmett Hono sample. Do not create `catalogue.ts`. Define a small hardcoded lookup behind the same asynchronous function shape:

```ts
const getUnitPrice = async (productId: string): Promise<number> => {
  // local lookup
};
```

Keep this boundary visible even though the local implementation is immediate. The README must explain that a production Worker would commonly replace it with a typed RPC call through a Cloudflare Service Binding. Show a short illustrative snippet, but do not configure or require a third Worker in the runnable sample.

## Pongo schema and indexes

Copy `samples/simple-ts/src/pongo.config.ts` into each sample as `src/pongo.config.ts`. Declare the `shoppingCarts` collection there with `pongoSchema`; do not introduce `schema.ts`. Use schema migrations rather than issuing ad hoc table/index creation from request handlers.

Add a custom SQLite partial unique index equivalent to:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS shopping_carts_one_open_per_client
ON shoppingCarts (json_extract(data, '$.clientId'))
WHERE json_extract(data, '$.status') = 'Opened';
```

The file has this shape:

```ts
import { SQL } from "@event-driven-io/dumbo";
import { pongoSchema } from "@event-driven-io/pongo";
import type { ShoppingCart } from "./shoppingCarts/shoppingCart";

const shoppingCarts = pongoSchema.collection<ShoppingCart>("shoppingCarts", {
  indexes: {
    currentByClient: pongoSchema.index.custom(
      "shopping_carts_one_open_per_client",
      ({ tableReference, indexReference }) => SQL`
        CREATE UNIQUE INDEX IF NOT EXISTS ${indexReference}
        ON ${tableReference} (json_extract(data, '$.clientId'))
        WHERE json_extract(data, '$.status') = 'Opened'
      `,
    ),
  },
});

export default {
  schema: pongoSchema.client({
    database: pongoSchema.db({ collections: { shoppingCarts } }),
  }),
};
```

The explicit `collections` property is required by Pongo `0.17.0-beta.52`; the older `pongoSchema.db({ shoppingCarts })` shorthand used by earlier samples is no longer valid.

Build the index through `pongoSchema.index.custom` with Dumbo's public `SQL` token and the supplied table/index references; do not interpolate physical names manually. Import this config from the Worker and Durable Object composition code and pass `pongoConfig.schema` as the schema definition.

The index serves two purposes:

- It supports the `{ clientId, status: 'Opened' }` current-cart query.
- It enforces one opened cart per client even under concurrent creation.

The Durable Object sample uses the same schema. All documents inside one object have the same client ID, so the index is also a final storage-level invariant in addition to the actor boundary.

Tests and deployment use `schema: { definition, autoMigration: "None" }`. Local D1 development selects `"CreateOrUpdate"` through one environment binding so the first normal operation initializes a fresh local database automatically. This is the only local/production behavioral difference and preserves developer experience without changing routes, bindings, or persistence behavior.

Use these explicit migration boundaries:

- D1 exposes an operational `POST /_system/migrations` route. It authenticates a bearer token using the `MIGRATION_TOKEN` binding, calls `db.schema.migrate()`, and returns `204` only after the declared collection and index exist. The GitHub Actions deploy job invokes this route once and fails when it does not succeed.
- Each Durable Object has a separate private database, including objects first created long after a deployment. Construct its Pongo client once in the class constructor and call `ctx.blockConcurrencyWhile(async () => db.schema.migrate())`. This is an explicit migration with auto-migration disabled, not a first-collection-operation side effect. Cloudflare specifically recommends `blockConcurrencyWhile` for schema initialization before requests are delivered, while discouraging it for regular request handling.[^6]

Pongo records applied migrations in its own persistent ledger, so restarting an isolate or Durable Object safely skips already applied migrations. Cloudflare resource lifecycle and Pongo schema lifecycle remain separate:

- D1 provisioning creates or binds the Cloudflare database; it does not create Pongo collections or indexes.
- Durable Object `exports` provisions the class namespace and selects SQLite; it does not create tables inside each object's database.
- Pongo `db.schema.migrate()` creates the document collection, migration ledger, and partial unique index.

Do not add duplicate Wrangler `migrations/*.sql` files for the same Pongo-owned schema. The deployment workflow deliberately executes Pongo's own migration runner so its persistent migration ledger and custom index definition remain the single source of truth.

## D1 sample

Use imports from `@event-driven-io/pongo/cloudflare`:

```ts
import { d1Driver } from "@event-driven-io/pongo/cloudflare";
```

Create the Pongo client from the D1 binding:

```ts
pongoClient({
  driver: d1Driver,
  database: env.DB,
  schema: {
    definition: shoppingCartSchema,
    autoMigration:
      env.ENVIRONMENT === "development" ? "CreateOrUpdate" : "None",
  },
});
```

Do not set `transactionOptions: { mode: "session_based" }` merely because it sounds safer. D1 sessions provide sequential consistency and D1 batches are atomic, but the adapter cannot expose a general interactive transaction with rollback around arbitrary Pongo callbacks. This sample does not need to teach that limitation as a pretend transaction. `handle` supplies Pongo's optimistic document-write protection, and the partial unique index supplies the cross-document invariant.

Check in a minimal `wrangler.jsonc` with a draft D1 binding:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "pongo-shopping-cart-d1",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-11",
  "workers_dev": true,
  "d1_databases": [{ "binding": "DB" }],
  "vars": { "ENVIRONMENT": "production" },
}
```

Omitting `database_id` uses Wrangler's automatic resource provisioning, currently marked beta. `wrangler dev` creates and uses a local database, while the GitHub Actions deployment creates the remote D1 database when it first deploys the Worker.[^7] Cloudflare notes that deployments originating from GitHub do not write the generated resource ID back into the repository; the resulting binding and ID are visible through the Cloudflare dashboard. This tradeoff is intentional for a portable public sample: nobody runs a one-off deployment or commits an account-specific database ID. Do not set `remote: true`: local development and tests must not silently operate on production data.

Generate the Worker binding interface from this configuration:

```shell
wrangler types worker-configuration.d.ts --env-interface CloudflareBindings
```

Extend the generated binding type locally with `MIGRATION_TOKEN?: string` for the operational route. GitHub Actions publishes its production value as a Worker secret. Local development does not call that route and needs no migration token or environment file.

Export the Hono application as the default ES module Worker so Wrangler development, production deployment, and tests all invoke the same entry point.

Use one module-level Pongo database variable and a plain `getPongoDb(env)` function that initializes it from the first request's bindings. This keeps one collection instance per Worker isolate, so local `CreateOrUpdate` runs on its first collection operation rather than on every request. The migration route authenticates and calls `db.schema.migrate()`; deployed shopping-cart routes use the collection with `autoMigration: "None"`. No `WeakMap`, runtime container, repository wrapper, dependency-injection layer, or connection manager is needed. Do not claim that `client.connect()` applies migrations; it does not.

The D1 database is shared across clients. The first-add handler:

1. Finds `{ clientId, status: 'Opened' }`.
2. Uses that cart's ID when found.
3. Otherwise generates a new ID.
4. Calls `shoppingCarts.handle(id, state => addProductItem(command.data, state))`.
5. Allows `null` state only when this attempt generated a fresh ID. If a previously found cart disappears before `handle` runs, restart current-cart resolution and allocate a new ID rather than recreating the deleted cart under its stale ID.
6. Maps a partial-unique-index violation caused by concurrent creation to `409 Conflict`.

All ID-based commands call `handle(shoppingCartId, ...)` and validate the document's `clientId` inside the handler before changing it. The ID-based add wrapper rejects `null` state before calling the domain function; only the current route has create-or-update semantics.

Queries use Pongo's MongoDB-like `findOne` API. Do not fall back to raw SQL for application reads; raw/custom SQL is limited to the schema index declaration.

## Durable Object sample

Export a `ShoppingCartDurableObject` class as an infrastructure component, not as a new domain aggregate. Bind it in Wrangler configuration with SQLite enabled and identify instances by `clientId`.

Use the modern declarative Durable Object configuration:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "pongo-shopping-cart-durable-objects",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-11",
  "workers_dev": true,
  "durable_objects": {
    "bindings": [
      {
        "name": "SHOPPING_CARTS",
        "class_name": "ShoppingCartDurableObject",
      },
    ],
  },
  "exports": {
    "ShoppingCartDurableObject": {
      "type": "durable-object",
      "storage": "sqlite",
    },
  },
}
```

Do not also add a legacy `migrations` block: Wrangler's `exports` configuration declares and provisions the new SQLite-backed class. Export the class by that exact name from `src/index.ts`, and separately default-export the Hono application.[^4]

The front-door Hono Worker:

1. Parses and validates the public HTTP request.
2. Resolves the object with `env.SHOPPING_CARTS.getByName(clientId)` or the equivalent `idFromName`/stub call.
3. Calls a typed Durable Object RPC method for the requested command or query.
4. Maps the result or typed failure to the shared HTTP contract.

Resolve product pricing in the front-door Worker before invoking the Durable Object. That keeps external or future Service Binding I/O outside the object's storage transaction and passes a trusted, fully priced command across the RPC boundary.

The Durable Object:

- Is the actor-like coordination and storage boundary for one client's successive carts.
- Creates its Pongo client with `cloudflareDurableObjectSQLiteDriver` and `ctx.storage`.
- Runs schema initialization/migration safely during object initialization.
- Stores actual `ShoppingCart` documents in a Pongo collection; it does not store an invented owner document or an event stream.
- Exposes small typed RPC methods corresponding directly to the public use cases: get current, get by ID, add to current, add by ID, remove, confirm, and cancel.
- Verifies that any addressed document belongs to the object/client even though routing already provides that isolation.

Keep all requests affecting one client's active cart on that client's object. Durable Objects process requests with single-threaded JavaScript semantics and input gates around storage access, but application code can still interleave at `await` boundaries. Therefore each multi-step operation that discovers the current cart and then updates it must use a real Pongo Durable Object storage transaction, passing the returned session to both `findOne` and `handle`. Do not put catalogue lookups, RPC calls, or other network I/O inside this transaction. Cloudflare's actor routing provides the coordination boundary; the transaction makes each discovery-and-write operation atomic; the partial unique index remains the final data invariant.[^6]

Durable Object RPC can pass native structured-clone values, but expected application failures should still use an explicit serializable discriminated union rather than relying on custom error prototypes crossing the RPC boundary. The Worker maps these failures to the same Problem Details responses as the D1 sample. Unexpected exceptions remain failures and are not converted into domain results.

Do not expose an internal HTTP router on the Durable Object merely to tunnel the public request. Prefer typed RPC between the Worker and Durable Object.

## Project structure

Add a top-level sample index:

```text
samples/
  README.md
```

Each sample is an independent npm project with its own lockfile and no dependency on files from the other sample:

```text
samples/cloudflare/d1/
  .editorconfig
  .gitignore
  .nvmrc
  .prettierignore
  .prettierrc.json
  .vscode/
    extensions.json
    launch.json
    settings.json
    tasks.json
  README.md
  env.d.ts
  requests.http
  package.json
  package-lock.json
  tsconfig.json
  worker-configuration.d.ts
  eslint.config.mjs
  wrangler.jsonc
  vitest.config.ts
  src/
    index.ts
    pongo.config.ts
    shoppingCarts/
      index.ts
      api.ts
      api.int.spec.ts
      api.e2e.spec.ts
      businessLogic.ts
      businessLogic.unit.spec.ts
      shoppingCart.ts
```

```text
samples/cloudflare/durable-objects/
  .editorconfig
  .gitignore
  .nvmrc
  .prettierignore
  .prettierrc.json
  .vscode/
    extensions.json
    launch.json
    settings.json
    tasks.json
  README.md
  env.d.ts
  requests.http
  package.json
  package-lock.json
  tsconfig.json
  worker-configuration.d.ts
  eslint.config.mjs
  wrangler.jsonc
  vitest.config.ts
  src/
    index.ts
    pongo.config.ts
    shoppingCartDurableObject.ts
    shoppingCarts/
      index.ts
      api.ts
      api.int.spec.ts
      api.e2e.spec.ts
      businessLogic.ts
      businessLogic.unit.spec.ts
      shoppingCart.ts
```

This grouping is intentional and should not be replaced with a separate `test/`, `domain.ts`, `catalogue.ts`, or `schema.ts` layout. It follows the copied Emmett feature slice. The only additional source files are `pongo.config.ts`, taken from Pongo's existing sample convention, and the Durable Object class required by Cloudflare.

Use the researched dependency baseline above, refreshed to the latest compatible versions during implementation. Runtime dependencies are Hono, Pongo, and Dumbo. Dumbo is direct because the custom index declaration imports its public `SQL` tokens. Development dependencies include the Cloudflare Vitest plugin, Workers types, Wrangler, Vitest, TypeScript, ESLint, and Prettier. Declare `@cloudflare/workers-types` directly because the Pongo/Dumbo Cloudflare declaration files expose its types. Generate and check `worker-configuration.d.ts` using Wrangler rather than maintaining large handwritten platform interfaces. The root `env.d.ts` only augments `cloudflare:workers` with `interface ProvidedEnv extends CloudflareBindings {}` as prescribed by the Vitest plugin documentation.[^3] Ignore `.wrangler/`, `dist/`, coverage, and normal dependency artefacts.

## Tests

Follow test-first development. Name tests after observable behavior.

### Domain unit tests in each sample

Cover:

- First addition opens a cart and calculates totals.
- A later addition merges a matching line and recalculates totals.
- A later addition of the same product retains the line's captured unit price.
- Adding to a confirmed cart fails.
- Partial removal decreases line quantity and totals.
- Complete removal deletes the product line and permits an empty opened cart.
- Removing a missing or excessive quantity fails.
- Confirmation rejects a missing or empty cart.
- Confirmation changes an opened cart once and is idempotent thereafter.
- Cancellation rejects a confirmed cart and returns `null` for an opened or absent cart.
- Add, remove, and confirm leave the input document unchanged.

Duplication of these tests is intentional because each sample is independently runnable.

### HTTP and storage tests

The test suite must distinguish integration from end to end while keeping the copied Emmett filenames beside the feature code:

- `src/shoppingCarts/api.int.spec.ts` exercises Pongo through the real local binding supplied by the Cloudflare test runtime while calling the shopping-cart API setup directly. D1 tests use `env.DB`. Durable Object tests obtain a unique object stub with `env.SHOPPING_CARTS.getByName(clientId)` and call its public typed RPC methods. Use `runInDurableObject` only for a narrow storage-invariant assertion that cannot be observed through RPC.
- `src/shoppingCarts/api.e2e.spec.ts` imports `exports` from `cloudflare:workers` and sends Requests through `exports.default.fetch()`. This invokes the configured default Worker export, Hono routing, the D1 binding or Worker-to-Durable-Object RPC, Pongo, and SQLite in one local runtime process.[^3]

Use Emmett Hono's `ApiSpecification` for the integration tests. Its current API requires an EventStore even though this sample is document based, so supply a fresh in-memory EventStore only as test-harness plumbing; do not expose it to application code or assert events. Keep the smaller E2E suite on `exports.default.fetch()` because `ApiSpecification` executes a Hono application directly and cannot verify the configured Worker export and its Cloudflare bindings. A future Emmett Hono improvement could add a document/API-only overload and a dedicated testing subpath export.

This differs deliberately from Emmett's current D1 package tests. On Emmett `main` at commit `d1882f6` (2026-09-11), both `.d1.int.spec.ts` and `.d1.e2e.spec.ts` construct `new Miniflare({ d1Databases: { DB: "test-db-id" } })` and obtain the database through `mf.getD1Database("DB")`. They test the library directly in a Node Vitest environment, not a deployed Worker entry point. Emmett currently has no Durable Object integration or E2E provisioning to copy. That pattern is valid for a storage library, but Cloudflare's current Vitest plugin is the better fit for runnable Worker samples because it provisions the bindings from the same `wrangler.jsonc` used by development and deployment.[^2]

Configure each sample with:

```ts
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: {
    include: ["src/**/*.spec.ts"],
  },
});
```

For the D1 sample, add `miniflare: { bindings: { ENVIRONMENT: "test", MIGRATION_TOKEN: "test-migration-token" } }` to `cloudflareTest`. Storage integration setup calls `db.schema.migrate()` once before exercising the real D1-backed collection. HTTP E2E setup calls the authenticated `POST /_system/migrations` route once through `exports.default.fetch()` before the shopping-cart flow. This exercises the production `autoMigration: "None"` path. For the Durable Object sample, each uniquely named test object performs its explicit constructor migration before the RPC call is delivered.

The plugin starts local `workerd`-based environments and provisions a local D1 database or Durable Object namespace from Wrangler configuration. Tests do not require a Cloudflare account, API token, pre-created remote database, Docker, or a separately running `wrangler dev` process. Storage is isolated per test file; generate unique client/cart IDs within tests and do not depend on test ordering.[^2]

Keep the suite focused:

- The D1 system migration route rejects a missing or incorrect token, applies the declared schema with the correct token, and succeeds idempotently when repeated.
- First addition returns `201`, an empty body, and an ID-based `Location`.
- The location can be followed to query the stored cart.
- `GET .../current` returns the same permanent ID.
- Query responses omit Pongo's internal bigint `_version` and serialize successfully.
- A later ID-based addition writes the document and returns `204`.
- An ID-based addition to a missing or cancelled cart returns `404` and does not recreate the old ID.
- Partial and complete removal are persisted.
- Confirmation is persisted and a repeat returns `204` without another state change.
- After confirmation, current returns `404`, and the next first addition creates a different ID.
- Cancellation deletes an opened cart and repeating it returns `204`.
- If an active cart is cancelled between current-cart lookup and mutation, the first-add flow retries discovery and never recreates the cancelled ID.
- Invalid input and domain conflicts produce the expected Problem Details responses.
- Two competing first additions never leave two opened carts for one client; D1 maps a unique conflict to `409`, while the Durable Object keeps both requests within the same client actor and still satisfies the invariant.

Run tests in Cloudflare's local Workers test environment so D1 and Durable Object SQLite behavior is exercised rather than replacing persistence with a custom in-memory repository. Avoid a bespoke end-to-end framework and remote deployment tests.

## Manual HTTP walkthrough

Each optional `requests.http` walkthrough demonstrates:

1. Add the first product through `current`.
2. Read the returned `Location`.
3. Read the same cart through `GET current` and by ID.
4. Add another product by ID.
5. Remove part of a product quantity, then remove the remainder.
6. Add a product and confirm the cart.
7. Confirm it again to show idempotency.
8. Show that `GET current` now returns `404`.
9. Add a product through `current` and receive a new cart ID.
10. Cancel the new cart twice to show idempotency.

Do not include a filtered-history request.

## Setup and local development

Generate the current Hono Workers scaffold in a temporary directory, copy the required baseline files into the two sample directories, and then apply the copy/adapt map above. Do not leave unused `create-cloudflare` boilerplate in the repository or require sample users to rerun a generator. Wrangler CLI is used for generated types, local execution, dry-run bundling, and GitHub Actions deployment, never for a human deployment and never through the Cloudflare dashboard.

From either sample directory, a fresh clone uses:

```shell
npm ci
npm run types:cloudflare:check
npm run build:ts
npm test
npm run dev
```

`wrangler dev` runs the Worker locally and provisions the configured local D1 binding or Durable Object namespace without a Cloudflare login. Persistent local-development data lives under `.wrangler/state`; deleting that ignored directory resets only local state.[^5]

For D1 local development, `npm run dev` overrides `ENVIRONMENT` to `development`, enabling Pongo's supported `CreateOrUpdate` mode for the cached collection. The first normal cart operation initializes a fresh local database. Deployment and tests keep `ENVIRONMENT` as `production` or `test`, selecting `None`. Durable Object instances migrate their private database during activation. Neither sample requires credentials, environment files, a migration command, or `requests.http` for local setup.

The generated binding types are checked in so a fresh `npm ci` can type-check immediately. Run `npm run types:cloudflare` whenever `wrangler.jsonc`, the compatibility date, or exported Durable Object classes change, and commit the regenerated file.

The package scripts are concrete:

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run --outdir dist",
    "types:cloudflare": "wrangler types worker-configuration.d.ts --env-interface CloudflareBindings",
    "types:cloudflare:check": "wrangler types worker-configuration.d.ts --env-interface CloudflareBindings --check",
    "build:ts": "tsc --noEmit",
    "build:ts:watch": "tsc --noEmit --watch",
    "lint": "eslint . && prettier --check .",
    "test": "vitest run",
    "test:unit": "vitest run src/shoppingCarts/businessLogic.unit.spec.ts",
    "test:int": "vitest run src/shoppingCarts/api.int.spec.ts",
    "test:e2e": "vitest run src/shoppingCarts/api.e2e.spec.ts"
  }
}
```

The D1 package changes only its `dev` entry to `wrangler dev --var ENVIRONMENT:development`. The Durable Object package uses the base scripts unchanged. Do not add a process supervisor, custom development launcher, or second setup command.

The dry-run build is mandatory. A test-time module resolver can hide an import or Worker-bundling problem that `wrangler deploy --dry-run` will expose.

## Deployment

Nobody deploys either sample manually. Each sample's dedicated GitHub Actions workflow validates and deploys its Worker after a matching change is merged to the upstream `main` branch. Pull requests and manual workflow dispatches run validation only.

Repository administrators perform one-time credential setup, not deployments:

- Add `CLOUDFLARE_ACCOUNT_ID` as a GitHub Actions secret.
- Create a narrowly scoped Cloudflare API token and add it as `CLOUDFLARE_API_TOKEN`. It needs permission to edit Workers; because the D1 workflow automatically provisions a database, it also needs D1 edit permission. Restrict both permissions to the deployment account.[^8]
- Generate an independent random value for the D1 migration endpoint and add it as `CLOUDFLARE_MIGRATION_TOKEN`. The workflow publishes it to the D1 Worker as the `MIGRATION_TOKEN` secret; never place it in `wrangler.jsonc`, logs, or source control.
- Ensure that account has a `workers.dev` subdomain because both sample configurations use `workers_dev: true`.

Each workflow has a `build_and_test` job and a `deploy` job. The deploy job:

- Depends on the successful validation job.
- Runs only for `push` events on `refs/heads/main` in `event-driven-io/Pongo`, preventing forks and pull requests from accessing deployment secrets.
- Checks out the exact commit and sets up Node from the sample's `.nvmrc`.
- Runs `npm ci` in the sample directory so deployment uses the locked Wrangler version.
- Uses the current `cloudflare/wrangler-action@v4` with `workingDirectory`, `apiToken`, `accountId`, and `command: deploy`.[^9]
- Uses the action's `deployment-url` output to write the deployed Worker URL to the GitHub job summary.

The workflow shape for each sample is explicit:

```yaml
deploy:
  if: github.event_name == 'push' && github.ref == 'refs/heads/main' && github.repository == 'event-driven-io/Pongo'
  needs: build_and_test
  runs-on: ubuntu-latest
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@v7
    - uses: actions/setup-node@v7
      with:
        node-version-file: samples/cloudflare/<sample>/.nvmrc
        cache: npm
        cache-dependency-path: samples/cloudflare/<sample>/package-lock.json
    - run: npm ci
      working-directory: samples/cloudflare/<sample>
    - id: deploy
      uses: cloudflare/wrangler-action@v4
      with:
        apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
        accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        workingDirectory: samples/cloudflare/<sample>
        command: deploy
    - name: Publish deployment URL
      env:
        DEPLOYMENT_URL: ${{ steps.deploy.outputs.deployment-url }}
      run: echo "### Deployed to $DEPLOYMENT_URL" >> "$GITHUB_STEP_SUMMARY"
```

For D1, the checked-in binding deliberately has no `database_id`. The first successful GitHub Actions deployment asks Wrangler to auto-provision the remote database and bind it to `DB`; later deployments update the same Worker and binding. No `wrangler d1 create` command or human deployment is part of the flow. Because automatic provisioning is beta and its generated ID is retained by Cloudflare rather than written back to the source repository, this choice and its portability tradeoff must be prominent in the D1 README.[^1]

The D1 action step additionally publishes the migration secret and then invokes Pongo migration:

```yaml
- id: deploy
  uses: cloudflare/wrangler-action@v4
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    workingDirectory: samples/cloudflare/d1
    command: deploy
    secrets: MIGRATION_TOKEN
  env:
    MIGRATION_TOKEN: ${{ secrets.CLOUDFLARE_MIGRATION_TOKEN }}
- name: Apply Pongo schema
  env:
    DEPLOYMENT_URL: ${{ steps.deploy.outputs.deployment-url }}
    MIGRATION_TOKEN: ${{ secrets.CLOUDFLARE_MIGRATION_TOKEN }}
  run: curl --fail-with-body --request POST --header "Authorization: Bearer $MIGRATION_TOKEN" "$DEPLOYMENT_URL/_system/migrations"
```

This is the deployment migration: `autoMigration` remains `"None"`, the deployment workflow calls `db.schema.migrate()` exactly once, and any non-2xx response fails the job. The endpoint must compare the complete bearer value, disclose no secret details, and map unexpected migration errors to `500`. Ordinary D1 requests never invoke it.

For Durable Objects, Wrangler reads the `ShoppingCartDurableObject` export with `storage: "sqlite"`, provisions its namespace as part of deployment, binds it as `SHOPPING_CARTS`, and uploads the Worker. There is no separate namespace-creation job.[^4]

There are no duplicate Cloudflare SQL migration files. D1 migration is a GitHub Actions deployment step. Durable Object migration remains per-object initialization because each object owns an independent database and future objects do not exist at deployment time.

## Documentation

`samples/README.md` briefly introduces and links the existing simple TypeScript sample and both new Cloudflare samples.

Each Cloudflare README should read like a compact Getting Started guide:

1. Explain why the example uses document-based CRUD with CQRS-style separation between commands and queries.
2. Introduce the shopping-cart document and why product lines and totals are embedded.
3. Walk through each domain function and how its return value maps to Pongo `handle`.
4. Explain the permanent cart ID, `current` lookup, confirmation, cancellation, and opening the next cart.
5. Show the Pongo driver configuration and schema/index declaration.
6. Explain the storage-specific architecture: shared D1 database or client-keyed Durable Object actor.
7. Explain Hono usage and identify Emmett only as presentation and domain-flow inspiration, without adding event-sourcing dependencies.
8. Explain the local catalogue boundary and show the production Service Binding alternative.
9. Provide install, type-generation, local development, test, migration, and automated GitHub Actions deployment instructions.
10. Link the optional `requests.http` file as a complete API walkthrough, not as a setup step.

The Durable Object README must state that the class name is infrastructure terminology and the actual domain consistency boundary remains a `ShoppingCart` document. Explain why the object is keyed by client ID: it coordinates discovery and creation of that client's single active cart while retaining permanent IDs for successive carts.

Reference:

- Cloudflare Durable Object concepts and best practices.
- Cloudflare typed RPC and Service Bindings.
- Pongo documentation for `handle`, schema, and Cloudflare drivers.
- Emmett Getting Started and Hono integration as presentation/testing inspiration.

## Scripts and CI

Each sample provides the exact development, test, type-generation, and dry-run build scripts listed above. Production deployment is defined in GitHub Actions rather than an npm script intended for humans.

Add two dedicated workflows:

- `.github/workflows/build_and_test_sample_cloudflare-d1.yml`
- `.github/workflows/build_and_test_sample_cloudflare-durable-objects.yml`

Follow the structure of Emmett's `build_and_test_sample_webapi-expressjs-with-esdb.yml`:

- Trigger on changes under the corresponding sample and workflow file, plus manual dispatch.
- Set the sample directory as the default working directory.
- Check out the repository.
- Set up Node from that sample's `.nvmrc`.
- Cache npm using that sample's lockfile.
- Run `npm ci`, `npm run types:cloudflare:check`, `npm run build:ts`, `npm run lint`, `npm test`, and `npm run build`.
- Treat `npm run build` as a Wrangler dry-run bundle, not a production deployment.
- Do not include Docker steps.
- Keep the `build_and_test` job local and credential-free.
- Add the deployment job defined above. It uses repository secrets only after a successful upstream `main` build; pull requests, forks, and manual validation runs never receive those secrets or deploy.

## Implementation sequence

An implementer should be able to execute this specification in the following order without making additional design choices:

1. Run the verified `create-cloudflare` Hono Workers command in a temporary directory. Copy its Worker baseline into `samples/cloudflare/d1` and `samples/cloudflare/durable-objects`; remove assets, example routes, manual deployment scripts, and other unused generated files.
2. Copy the editor, Prettier, ESLint, and VS Code files using the source-by-source map above. Apply only the listed Cloudflare and Vitest path/global changes.
3. Copy the seven listed `src/shoppingCarts` files from Emmett into both samples. Delete projections, events, `evolve`, event-store/message-bus plumbing, observability, and Node server code.
4. Copy Pongo's `samples/simple-ts/src/pongo.config.ts` convention into both samples. Replace its example document with `ShoppingCart` and add the specified partial unique index.
5. Rewrite `shoppingCart.ts`, `businessLogic.ts`, and `businessLogic.unit.spec.ts` to the exact document contracts and operations above. Run the colocated unit test before adding persistence.
6. Adapt `api.ts` from the copied Emmett Hono API. Keep its route-registration and injected `getUnitPrice`/clock style; replace command-handler/event-store calls with the direct Pongo `handle` flows specified here. Keep the catalogue implementation in `src/index.ts`.
7. Complete the D1 composition in `src/index.ts`, including its binding-backed Pongo client and authenticated migration route. Rewrite the colocated `api.int.spec.ts` and `api.e2e.spec.ts` for the real local D1 binding and Worker export.
8. Complete `shoppingCartDurableObject.ts` from Cloudflare's required class shape, use the same copied shopping-cart business functions in its typed RPC methods, and connect `api.ts` through the client-keyed namespace. Rewrite the colocated integration and E2E specs for the real local Durable Object binding and Worker export.
9. Resolve the latest compatible dependencies, regenerate and commit each lockfile and `worker-configuration.d.ts`, add `requests.http`, and write the Getting Started-style READMEs and top-level sample index.
10. Copy the named Emmett workflow as the CI starting point and adapt it into the two path-filtered GitHub Actions workflows. The D1 deployment syncs `MIGRATION_TOKEN` and calls the migration endpoint; the Durable Object deployment relies on per-object constructor migration.
11. Run each sample's type-generation check, TypeScript build, lint, unit/integration/E2E suite, and Wrangler dry-run bundle. Verify the workflow YAML and confirm no account IDs or credentials were committed.

## Acceptance criteria

- Both sample directories install, build, lint, type-check, and test independently.
- Both Workers run locally under Wrangler from checked-in `wrangler.jsonc` files and expose the same documented API.
- Dependencies are refreshed to the latest mutually compatible versions during implementation and locked; Vitest satisfies the Cloudflare plugin's declared peer range, and the intended Pongo/Dumbo beta versions are used rather than the malformed npm `latest` tag.
- Wrangler-generated `CloudflareBindings` types are checked in and pass `wrangler types --check`.
- The D1 sample imports and uses `d1Driver` from `@event-driven-io/pongo/cloudflare`.
- The Durable Object sample imports and uses `cloudflareDurableObjectSQLiteDriver` with the object's SQLite storage.
- D1 is locally provisioned from its binding declaration and remotely auto-provisioned by its GitHub Actions deployment; there is no manual `wrangler d1 create` or deployment step.
- The Durable Object uses the modern Wrangler `exports` declaration with SQLite storage; no legacy Durable Object migration block or manual namespace-creation step is present.
- Both production bundles pass `wrangler deploy --dry-run` without Cloudflare credentials.
- The first product addition creates a permanent cart document when needed and updates the active cart otherwise.
- Every later mutation uses the permanent cart ID exposed in `Location`.
- Both query endpoints return the same active document while the cart is opened.
- Public query DTOs omit Pongo's bigint `_version` and are JSON-serializable.
- ID-based addition never creates a missing document or resurrects a cancelled ID.
- Confirmation preserves the document as `Confirmed`; cancellation deletes an opened document.
- Repeated confirmation and cancellation are idempotent.
- A new cart can be opened after the previous cart is confirmed or cancelled.
- One-active-cart-per-client is protected under concurrent requests.
- The partial unique index is declared through Pongo schema migrations.
- D1 uses `CreateOrUpdate` only under local `ENVIRONMENT=development`; tests and deployment use `None`, and only the deployment migration route explicitly calls `db.schema.migrate()` there.
- Each Durable Object uses `autoMigration: "None"` and explicitly migrates its own database once during activation.
- The D1 deployment publishes `MIGRATION_TOKEN`, calls the authenticated migration endpoint after deployment, and fails if `db.schema.migrate()` fails.
- Each Durable Object explicitly runs `db.schema.migrate()` inside `blockConcurrencyWhile` because its private database may be created after deployment.
- Each standalone package declares `@event-driven-io/dumbo` directly for custom-index SQL construction.
- Application and test code contain no event store, event types, `evolve`, projections, or invented owner aggregate.
- Storage integration tests use the real local Cloudflare bindings, and HTTP E2E tests invoke `exports.default.fetch()` through the Cloudflare Vitest plugin rather than calling Hono directly.
- D1 and Durable Object tests provision only local resources from Wrangler configuration; they require no account, token, Docker container, dashboard setup, or running development server.
- Documentation explains both document modelling and Cloudflare architecture in a concise Getting Started style.
- The sample index and both dedicated GitHub Actions workflows are present.
- CI performs type-generation consistency checks, TypeScript validation, linting, local Worker-runtime tests, and Wrangler dry-run bundles. Successful matching pushes to the upstream `main` branch then deploy both Workers through `cloudflare/wrangler-action@v4`; no human deployment is required.

## Research sources

The Cloudflare details in this specification were checked against current official documentation on 2026-09-12 and the current generated Hono Workers scaffold was verified locally with `create-cloudflare` 2.72.7 on 2026-09-13. Package versions were checked against their npm registry metadata on 2026-09-12. The Emmett comparison was checked against local and upstream `event-driven-io/emmett` `main` at commit `d1882f692014366b7fef28f0e1cec925590dd697`.

[^1]: Cloudflare, [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/).

[^2]: Cloudflare, [Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/) and [Vitest plugin announcement](https://developers.cloudflare.com/changelog/post/2026-08-19-vitest-plugin/).

[^3]: Cloudflare, [Vitest integration test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/) and [Write your first Workers test](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/).

[^4]: Cloudflare, [Durable Object migrations and declarative exports](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).

[^5]: Cloudflare, [Local development data](https://developers.cloudflare.com/workers/local-development/local-data/) and [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/).

[^6]: Cloudflare, [Durable Object state and concurrency](https://developers.cloudflare.com/durable-objects/api/state/) and [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/).

[^7]: Cloudflare, [D1 getting started](https://developers.cloudflare.com/d1/get-started/) and [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/).

[^8]: Cloudflare, [Deploy Workers with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

[^9]: Cloudflare, [`wrangler-action` usage and version 4](https://github.com/cloudflare/wrangler-action).

[^10]: Cloudflare, [Create a Worker with the `create-cloudflare` CLI](https://developers.cloudflare.com/workers/get-started/guide/) and Hono, [Cloudflare Workers starter template](https://github.com/honojs/create-hono).
