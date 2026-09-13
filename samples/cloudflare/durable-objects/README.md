# Pongo on Cloudflare Durable Objects

This standalone sample implements the same shopping-cart HTTP API with [Hono](https://hono.dev/), [Pongo](https://github.com/event-driven-io/Pongo), and SQLite-backed Cloudflare Durable Objects. It uses document-based CRUD internally while keeping commands that change a cart separate from queries that read one. It is deliberately not event sourced.

## How the cart is modelled

Each shopping cart is one document. Product lines, their captured unit prices, the item count, and the total amount are embedded so the API reads and writes the cart as one consistency boundary.

The command functions in [`businessLogic.ts`](./src/shoppingCarts/businessLogic.ts) are immutable: they receive the current document and return the next document. Cancellation returns `null`. Pongo `handle` maps those results to insert, replace, delete, or an idempotent no-op. Queries use `findOne` directly.

The first product added through `/current` opens a cart and returns its permanent URL in the `Location` header. Confirmation keeps the closed cart under that ID, while cancellation deletes an opened cart. The next addition through `/current` creates a new cart when no opened cart exists. A partial unique index declared in [`pongo.config.ts`](./src/pongo.config.ts) guarantees that a client has at most one opened cart.

Prices are integer minor units: `1000` means 10.00 in the chosen currency. The local pricing lookup contains `product-1` at `1000` and `product-2` at `2500`. A product's price is captured when it first enters a cart; clients cannot submit trusted prices.

## Actor-like Durable Object boundary

The front-door Worker routes every request for a client through `SHOPPING_CARTS.getByName(clientId)`. Cloudflare therefore places that client's operations on one `ShoppingCartDurableObject`, which coordinates discovery and creation of the client's single active cart.

`ShoppingCartDurableObject` is infrastructure terminology, not a new domain abstraction. The domain consistency boundary remains a permanent-ID `ShoppingCart` document. One client-keyed object can retain confirmed carts and create later carts with new IDs. Each object owns isolated SQLite storage and uses Pongo's `cloudflareDurableObjectSQLiteDriver` over `ctx.storage`.

The Worker resolves product prices before making typed RPC calls to the Durable Object. The object exposes only the shopping-cart use cases and persistence coordination; it does not contain an HTTP router, pricing calls, or event-sourcing machinery.

## HTTP API

| Use case                                                   | Request                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Add a product to the current cart, opening one when needed | `POST /clients/:clientId/shopping-carts/current/product-items`                                 |
| Find the current cart and its permanent ID                 | `GET /clients/:clientId/shopping-carts/current`                                                |
| Get a cart by its permanent ID                             | `GET /clients/:clientId/shopping-carts/:shoppingCartId`                                        |
| Add a product to a known cart                              | `POST /clients/:clientId/shopping-carts/:shoppingCartId/product-items`                         |
| Remove a quantity from a product line                      | `DELETE /clients/:clientId/shopping-carts/:shoppingCartId/product-items/:productId?quantity=N` |
| Confirm a cart                                             | `POST /clients/:clientId/shopping-carts/:shoppingCartId/confirm`                               |
| Cancel an opened cart                                      | `DELETE /clients/:clientId/shopping-carts/:shoppingCartId`                                     |

Product additions use a JSON body such as:

```json
{
  "productId": "product-1",
  "quantity": 2
}
```

The first addition returns `201 Created`; later additions return `204 No Content`. Both include the permanent cart URL in `Location` and its current version in `ETag`. Reads return the document and its `ETag`. Send that value unchanged in `If-Match` for commands targeting the permanent cart URL. A stale version returns `412 Precondition Failed`.

For example, start a cart locally with:

```shell
curl -i --request POST http://localhost:8787/clients/client-1/shopping-carts/current/product-items \
  --header 'Content-Type: application/json' \
  --data '{"productId":"product-1","quantity":2}'
```

Then retrieve the current cart and its latest `ETag`:

```shell
curl -i http://localhost:8787/clients/client-1/shopping-carts/current
```

## Per-object schema migration

Each Durable Object has its own private database, including objects created long after the Worker was deployed. Pongo therefore uses `autoMigration: "None"` and explicitly runs `db.schema.migrate()` inside `ctx.blockConcurrencyWhile()` when an object activates. Requests are not delivered to that object until its collection, migration ledger, and partial unique index are ready.

Wrangler's declarative `exports` configuration in [`wrangler.jsonc`](./wrangler.jsonc) separately provisions the SQLite-backed Durable Object namespace. There is no legacy Durable Object migration array, central database migration endpoint, or duplicate Wrangler SQL migration.

## Run locally

Use the Node version from [`.nvmrc`](./.nvmrc), then install and start the Worker:

```shell
npm ci
npm run dev
```

Wrangler prints the local URL, normally `http://localhost:8787`. Local development needs no Cloudflare login, environment file, migration request, or manually created Durable Object namespace. Local data is kept under the ignored `.wrangler/state` directory.

Useful checks are:

```shell
npm run types:cloudflare:check
npm run build:ts
npm test
npm run lint
npm run build
```

`npm run build` is a Wrangler dry-run bundle. It does not deploy anything. Run `npm run types:cloudflare` after changing Worker bindings to regenerate [`worker-configuration.d.ts`](./worker-configuration.d.ts).

## Deploy with GitHub Actions

Production deployment is defined in the repository-level [Cloudflare Durable Objects workflow](../../../.github/workflows/build_and_test_sample_cloudflare-durable-objects.yml). Nobody needs to run `wrangler deploy` manually.

In the repository that will deploy the sample, open **Settings → Secrets and variables → Actions** and configure:

- Repository variable `CLOUDFLARE_DEPLOY_ENABLED` with value `true`. Without it, the deployment job is skipped, which keeps ordinary forks validation-only.
- Secret `CLOUDFLARE_ACCOUNT_ID` containing the target Cloudflare account ID.
- Secret `CLOUDFLARE_API_TOKEN` containing a token scoped to that account with permission to create and deploy Workers and Durable Object resources. Do not use a Global API Key.

Also ensure the Cloudflare account has a `workers.dev` subdomain. Protect the repository's `main` branch and require review for workflow changes, because a workflow running after merge can access deployment secrets.

After a matching change is pushed to `main`, the workflow validates the sample, deploys it, and writes the exact deployment URL to the GitHub Actions job summary. Pull requests and manual workflow runs validate but do not deploy.

Wrangler deploys the Worker named `pongo-shopping-cart-durable-objects` into the account selected by `CLOUDFLARE_ACCOUNT_ID`. With `workers_dev: true`, its URL is normally:

```text
https://pongo-shopping-cart-durable-objects.<your-workers-subdomain>.workers.dev
```

Change `name` in [`wrangler.jsonc`](./wrangler.jsonc) before enabling deployment if that Cloudflare account already contains a Worker with this name; deploying the sample updates the same named Worker.

On the first deployment, Wrangler reads the declarative `ShoppingCartDurableObject` export, provisions its SQLite-backed namespace, and binds it as `SHOPPING_CARTS`. Later deployments reconcile the same declaration. Individual object databases and their Pongo schemas are initialized when those objects first activate.

If you copy this sample as a separate repository, also copy the workflow into `.github/workflows`. When the sample is no longer under `samples/cloudflare/durable-objects`, update the workflow's path filters, `workingDirectory`, Node version file path, and lockfile path. There is no repository-name condition to replace: a fork deploys to its own account once it explicitly enables deployment and supplies its own secrets.

## Security scope

This sample has no end-user authentication or authorization. A deployed `workers.dev` endpoint is public, so use an isolated development account and synthetic data only. The Cloudflare API token remains available only to GitHub Actions. Keep it out of source control and logs, grant it only the account permissions the workflow requires, protect `main`, and review changes to deployment workflows before merging them.

## Production pricing boundary

The in-memory pricing lookup keeps this sample self-contained. In a production system, pricing would commonly be owned by another Worker and reached through a typed [Service Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/):

```ts
type Pricing = {
  getUnitPrice(productId: string): Promise<number>;
};

type Bindings = {
  PRICING: Service<Pricing>;
};

const getUnitPrice = (env: Bindings, productId: string) =>
  env.PRICING.getUnitPrice(productId);
```

That changes the infrastructure supplying the price, not the shopping-cart business logic or actor boundary.

## Further reading

- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Durable Object design rules and best practices](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [Durable Object class exports](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
- [Workers RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/)
- [Deploy Workers with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Emmett Getting Started](https://event-driven-io.github.io/emmett/getting-started.html), used as presentation and testing inspiration rather than for event sourcing here
