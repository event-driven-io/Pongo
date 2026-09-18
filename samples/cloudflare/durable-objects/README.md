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

## Deploy to Cloudflare

This tutorial takes the sample from your machine to a public `workers.dev` URL. First you prepare a Cloudflare account, then you deploy from your terminal, and finally you let GitHub Actions deploy every change merged to `main`.

### Prepare your Cloudflare account

Do this once. The same account and API token also serve the [Cloudflare D1 sample](../d1/README.md).

1. Create a [Cloudflare account](https://dash.cloudflare.com/sign-up). The free plan supports SQLite-backed Durable Objects, so you need no paid plan.
2. Open **Workers & Pages** in the dashboard once and pick a `workers.dev` subdomain. Every Worker you deploy gets a URL under it.
3. Copy your **Account ID**. The dashboard shows it in the sidebar of the account home and of the **Workers & Pages** overview.
4. Create an API token, but only if you'll deploy through GitHub Actions. Go to **My Profile → API Tokens → Create Token** and pick the **Edit Cloudflare Workers** template. Its **Workers Scripts: Edit** permission also covers Durable Object namespaces. Under **Account Resources**, include only this account. If you'll deploy the D1 sample with the same token, add **Account → D1 → Edit**. Do not use a Global API Key. Copy the token when Cloudflare shows it; it appears only once.
5. Use an isolated development account if you can. The deployed API is public and has no authentication; see [Security scope](#security-scope).

### Deploy from your machine

Install dependencies:

```shell
npm ci
```

Log in to Cloudflare:

```shell
npx wrangler login
```

Wrangler opens your browser and asks you to authorize it. Run `npx wrangler whoami` to see which account you're logged in to. If your login has access to several accounts, set the `CLOUDFLARE_ACCOUNT_ID` environment variable to the one you want.

Deploy the Worker:

```shell
npm run deploy
```

On the first deployment, Wrangler provisions the SQLite-backed Durable Object namespace from the `exports` declaration and binds it as `SHOPPING_CARTS`. When it finishes, it prints the Worker's URL:

```text
https://pongo-shopping-cart-durable-objects.<your-workers-subdomain>.workers.dev
```

There is no migration step. Each Durable Object migrates its own schema when it first activates, as described in [Per-object schema migration](#per-object-schema-migration).

Check that the deployed API works by running the local examples against that URL:

```shell
curl -i --request POST https://pongo-shopping-cart-durable-objects.<your-workers-subdomain>.workers.dev/clients/client-1/shopping-carts/current/product-items \
  --header 'Content-Type: application/json' \
  --data '{"productId":"product-1","quantity":2}'
```

You'll see `201 Created` with the permanent cart URL in `Location`. Then read the current cart:

```shell
curl -i https://pongo-shopping-cart-durable-objects.<your-workers-subdomain>.workers.dev/clients/client-1/shopping-carts/current
```

You'll see `200 OK`, the cart document, and its `ETag`.

To deploy later changes, run `npm run deploy` again.

### Deploy with GitHub Actions

The repository-level [Cloudflare Durable Objects workflow](../../../.github/workflows/build_and_test_sample_cloudflare-durable-objects.yml) validates the sample and can deploy it.

In the repository that will deploy the sample, open **Settings → Secrets and variables → Actions** and add:

| Kind     | Name                        | Value                                                                                                                         |
| -------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Variable | `CLOUDFLARE_DEPLOY_ENABLED` | `true`. Without it, the deployment job is skipped, which keeps ordinary forks validation-only.                                |
| Secret   | `CLOUDFLARE_ACCOUNT_ID`     | The Account ID you copied.                                                                                                    |
| Secret   | `CLOUDFLARE_API_TOKEN`      | The API token you created. It must be scoped to that account with permission to deploy Workers and Durable Object namespaces. |

These are repository-level settings, so the D1 sample uses the same ones. The D1 sample also needs a `CLOUDFLARE_MIGRATION_TOKEN` secret.

You can set them with the GitHub CLI instead:

```shell
gh variable set CLOUDFLARE_DEPLOY_ENABLED --body true
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set CLOUDFLARE_API_TOKEN
```

`gh secret set NAME` without `--body` prompts for the value, so the secret stays out of your shell history. Add `--repo owner/name` if you run these commands outside the repository clone.

The workflow deploys in two cases:

- A push to `main` that changes the sample or the workflow.
- A manual run from `main`. Open **Actions → Build and test Sample - Cloudflare Durable Objects → Run workflow**, choose the `main` branch, and run it. Or use `gh workflow run build_and_test_sample_cloudflare-durable-objects.yml --ref main`.

Pull requests and manual runs from other branches validate but do not deploy. Configure the variable and secrets before merging the change that adds the sample; otherwise its push to `main` skips the deployment job. If that already happened, a manual run from `main` deploys it.

The job validates the sample, deploys it, and writes the deployment URL to the GitHub Actions job summary.

Protect the repository's `main` branch and require review for workflow changes, because a workflow running after merge can access deployment secrets.

Deployments from CI and from your machine to the same account update the same Worker.

### Worker name and Durable Object namespace

Wrangler deploys the Worker named `pongo-shopping-cart-durable-objects` into the selected account. With `workers_dev: true`, its URL is normally:

```text
https://pongo-shopping-cart-durable-objects.<your-workers-subdomain>.workers.dev
```

Change `name` in [`wrangler.jsonc`](./wrangler.jsonc) before the first deployment if that Cloudflare account already contains a Worker with this name; deploying the sample updates the same named Worker.

On the first deployment, Wrangler reads the declarative `ShoppingCartDurableObject` export, provisions its SQLite-backed namespace, and binds it as `SHOPPING_CARTS`. Later deployments reconcile the same declaration. Individual object databases and their Pongo schemas are initialized when those objects first activate.

### Copy the sample to its own repository

If you copy this sample as a separate repository, also copy the workflow into `.github/workflows`. When the sample is no longer under `samples/cloudflare/durable-objects`, update the workflow's path filters, `workingDirectory`, Node version file path, and lockfile path. There is no repository-name condition to replace: a fork deploys to its own account once it explicitly enables deployment and supplies its own secrets.

### Clean up

Delete the Worker:

```shell
npx wrangler delete
```

Wrangler asks for confirmation, then deletes the Worker and its associated resources. That includes the Durable Object namespace and every cart stored in it. You cannot undo this.

If GitHub Actions deploys the sample, stop it first, or the next push to `main` recreates the Worker:

```shell
gh variable delete CLOUDFLARE_DEPLOY_ENABLED
```

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
