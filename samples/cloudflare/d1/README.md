# Pongo on Cloudflare D1

This standalone sample implements a shopping-cart HTTP API with [Hono](https://hono.dev/), [Pongo](https://github.com/event-driven-io/Pongo), and Cloudflare D1. It uses document-based CRUD internally while keeping commands that change a cart separate from queries that read one. It is deliberately not event sourced.

## How the cart is modelled

Each shopping cart is one document. Product lines, their captured unit prices, the item count, and the total amount are embedded so the API reads and writes the cart as one consistency boundary.

The command functions in [`businessLogic.ts`](./src/shoppingCarts/businessLogic.ts) are immutable: they receive the current document and return the next document. Cancellation returns `null`. Pongo `handle` maps those results to insert, replace, delete, or an idempotent no-op. Queries use `findOne` directly.

The first product added through `/current` opens a cart and returns its permanent URL in the `Location` header. Confirmation keeps the closed cart under that ID, while cancellation deletes an opened cart. The next addition through `/current` creates a new cart when no opened cart exists. A partial unique index declared in [`pongo.config.ts`](./src/pongo.config.ts) guarantees that a client has at most one opened cart.

Prices are integer minor units: `1000` means 10.00 in the chosen currency. The local pricing lookup contains `product-1` at `1000` and `product-2` at `2500`. A product's price is captured when it first enters a cart; clients cannot submit trusted prices.

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

## D1 and schema migrations

The Worker creates Pongo with the Cloudflare `d1Driver` and the `DB` binding from [`wrangler.jsonc`](./wrangler.jsonc). Local development uses `CreateOrUpdate`, so the first normal cart operation initializes a fresh local database. Production uses `autoMigration: "None"`.

Production migration is part of deployment. After deploying, GitHub Actions calls the bearer-protected `POST /_system/migrations` operational endpoint once. That endpoint runs Pongo's schema migration, including the collection, migration ledger, and partial unique index. It is not part of the public shopping-cart API, and there are no duplicate Wrangler SQL migrations.

## Run locally

Use the Node version from [`.nvmrc`](./.nvmrc), then install and start the Worker:

```shell
npm ci
npm run dev
```

Wrangler prints the local URL, normally `http://localhost:8787`. Local development needs no Cloudflare login, environment file, migration request, or manually created D1 database. Local data is kept under the ignored `.wrangler/state` directory.

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

Production deployment is defined in the repository-level [Cloudflare D1 workflow](../../../.github/workflows/build_and_test_sample_cloudflare-d1.yml). Nobody needs to run `wrangler deploy` manually.

In the repository that will deploy the sample, open **Settings → Secrets and variables → Actions** and configure:

- Repository variable `CLOUDFLARE_DEPLOY_ENABLED` with value `true`. Without it, the deployment job is skipped, which keeps ordinary forks validation-only.
- Secret `CLOUDFLARE_ACCOUNT_ID` containing the target Cloudflare account ID.
- Secret `CLOUDFLARE_API_TOKEN` containing a token scoped to that account with permission to deploy Workers and create or edit D1 databases. Do not use a Global API Key.
- Secret `CLOUDFLARE_MIGRATION_TOKEN` containing an independent random value, for example one produced by `openssl rand -hex 32`. Do not reuse the Cloudflare API token.

Also ensure the Cloudflare account has a `workers.dev` subdomain. Protect the repository's `main` branch and require review for workflow changes, because a workflow running after merge can access deployment secrets.

After a matching change is pushed to `main`, the workflow validates the sample, deploys it, applies the Pongo migration, and writes the exact deployment URL to the GitHub Actions job summary. Pull requests and manual workflow runs validate but do not deploy.

Wrangler deploys the Worker named `pongo-shopping-cart-d1` into the account selected by `CLOUDFLARE_ACCOUNT_ID`. With `workers_dev: true`, its URL is normally:

```text
https://pongo-shopping-cart-d1.<your-workers-subdomain>.workers.dev
```

Change `name` in [`wrangler.jsonc`](./wrangler.jsonc) before enabling deployment if that Cloudflare account already contains a Worker with this name; deploying the sample updates the same named Worker.

The first deployment automatically provisions and binds the remote D1 database because the checked-in `DB` binding intentionally has no account-specific database ID. Later deployments reuse the binding stored by Cloudflare. The generated database ID is visible in the Cloudflare dashboard but is not written into this portable sample.

If you copy this sample as a separate repository, also copy the workflow into `.github/workflows`. When the sample is no longer under `samples/cloudflare/d1`, update the workflow's path filters, `workingDirectory`, Node version file path, and lockfile path. There is no repository-name condition to replace: a fork deploys to its own account once it explicitly enables deployment and supplies its own secrets.

## Security scope

This sample has no end-user authentication or authorization. A deployed `workers.dev` endpoint is public, so use an isolated development account and synthetic data only. The migration endpoint is protected by its independent Worker secret, while the Cloudflare API token remains available only to GitHub Actions. Keep both tokens out of source control and logs, and grant the API token only the account permissions the workflows require.

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

That changes the infrastructure supplying the price, not the shopping-cart business logic.

## Further reading

- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Deploy Workers with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Wrangler automatic resource provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/)
- [Emmett Getting Started](https://event-driven-io.github.io/emmett/getting-started.html), used as presentation and testing inspiration rather than for event sourcing here
