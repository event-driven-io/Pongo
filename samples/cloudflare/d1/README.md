# Pongo on Cloudflare D1

This standalone sample implements a shopping-cart HTTP API with [Hono](https://hono.dev/), [Pongo](https://github.com/event-driven-io/Pongo), and Cloudflare D1. It stores each cart's current state as a document and keeps commands that change a cart separate from queries that read one.

## How the cart is modelled

Each shopping cart is one document. Product lines, their captured unit prices, the item count, and the total amount are embedded so the API reads and writes the cart as one consistency boundary.

The command functions in [`businessLogic.ts`](./src/shoppingCarts/businessLogic.ts) are immutable: they receive the current document and return the next document. Cancellation returns `null`. Pongo `handle` maps those results to insert, replace, delete, or an idempotent no-op. Queries use `findOne` directly.

The first product added through `/current` opens a cart and returns its permanent URL in the `Location` header. Confirmation keeps the closed cart under that ID, while cancellation deletes an opened cart. The next addition through `/current` creates a new cart when no opened cart exists. A partial unique index declared in [`pongo.config.ts`](./src/pongo.config.ts) guarantees that a client has at most one opened cart.

Prices are integer minor units: `1000` means 10.00 in the chosen currency. The local pricing lookup contains `product-1` at `1000` and `product-2` at `2500`. A product's price is captured when it first enters a cart; clients send only the product ID and quantity.

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

The Worker creates Pongo with the Cloudflare `d1Driver` and the `DB` binding from [`wrangler.jsonc`](./wrangler.jsonc). Local development uses `CreateOrUpdate`, so the first cart operation initializes a fresh local database. Production uses `autoMigration: "None"`, so cart requests never change the schema.

`npm run deploy` migrates the production schema right after deploying. It deploys the Worker with `wrangler deploy`, stores a fresh random token with `wrangler secret put MIGRATION_TOKEN`, and calls the bearer-protected `POST /_system/migrations` endpoint with curl. The endpoint runs Pongo's schema migration, which creates the collection, the migration ledger, and the partial unique index. Every deploy generates a new token, so earlier tokens stop working. The endpoint sits outside the shopping-cart API, and Pongo owns the whole schema, so the sample keeps no separate Wrangler SQL migrations.

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

The shopping-cart business logic stays the same; only the source of the price changes.

## Run locally

Use the Node version from [`.nvmrc`](./.nvmrc), then install and start the Worker:

```shell
npm ci
npm run dev
```

Wrangler prints the local URL, normally `http://localhost:8787`. It runs the Worker against a local D1 database stored in the ignored `.wrangler/state` directory, so you can develop without logging in to Cloudflare. The first cart request creates the schema.

To check the sample, run:

```shell
npm run types:cloudflare:check
npm run build:ts
npm test
npm run lint
npm run build
```

`npm run build` bundles the Worker with a Wrangler dry run, without deploying it. Run `npm run types:cloudflare` after changing Worker bindings to regenerate [`worker-configuration.d.ts`](./worker-configuration.d.ts).

## Security scope

This sample has no end-user authentication or authorization. A deployed `workers.dev` endpoint is public, so use an isolated development account and synthetic data only. `npm run deploy` deploys with `wrangler deploy`, stores a fresh random token with `wrangler secret put MIGRATION_TOKEN`, and calls the migration endpoint with curl (retrying up to 5 times). It passes the token to Wrangler and curl through stdin, so the token never lands in a file, command line or log. The Cloudflare API token is stored only in GitHub Actions; local deploys use `wrangler login`. Keep the API token out of source control and logs, and grant it only the account permissions the workflow requires.

## Deploy to Cloudflare

This tutorial deploys the sample to a public `workers.dev` URL, first from your machine and then from GitHub Actions. You can stop after either part.

### Prepare your Cloudflare account

The [Cloudflare Durable Objects sample](../durable-objects/README.md) uses the same account and API token.

1. Create a [Cloudflare account](https://dash.cloudflare.com/sign-up). The free plan is enough for Workers and D1.
2. If you'll deploy through GitHub Actions, create an API token. Skip this step if you'll deploy only from your machine.
   - Go to **My Profile → API Tokens → Create Token**.
   - Pick the **Edit Cloudflare Workers** template.
   - Add **Account → D1 → Edit**. The template lacks it, and the first deployment creates the database.
   - Under **Account Resources**, include only this account.
   - Under **Zone Resources**, choose **Include → All zones from an account → your account**. The template includes zone permissions for Workers Routes, so Cloudflare requires a zone selection even though the sample deploys only to `workers.dev`.
   - Create the token and copy it. Cloudflare shows it only once.
   - Don't use a Global API Key.
3. Use a separate development account if you can. The deployed API is public and has no authentication; see [Security scope](#security-scope).

The API token is the only thing you create in the dashboard. Wrangler asks for the rest while deploying.

### Deploy from your machine

Install dependencies, log in, and deploy:

```shell
npm ci
npx wrangler login
npm run deploy
```

`wrangler login` opens your browser to authorize Wrangler. On the first deploy, Wrangler asks which account to use if your login can reach several, and offers to register a `workers.dev` subdomain if the account has none yet. It then provisions a D1 database for the `DB` binding. If the account already has D1 databases, Wrangler asks whether to connect an existing one or create a new one; choose **Create new**. Wrangler then asks for a database name; accept the default.

After Wrangler finishes, the script runs the schema migration and prints the Worker's URL:

```text
Deployed to https://pongo-shopping-cart-d1.<your-workers-subdomain>.workers.dev
```

A freshly deployed `workers.dev` URL can briefly return `404`, so curl retries the migration call up to five times, waiting longer each time. The migration is idempotent, which makes retrying safe. If every attempt fails, curl prints the last error and the script exits with an error.

Check the deployed API against the URL the script printed:

```shell
url=https://pongo-shopping-cart-d1.<your-workers-subdomain>.workers.dev

curl -i --request POST "$url/clients/client-1/shopping-carts/current/product-items" \
  --header 'Content-Type: application/json' \
  --data '{"productId":"product-1","quantity":2}'
```

You'll see `201 Created` with the permanent cart URL in `Location`. Then read the current cart:

```shell
curl -i "$url/clients/client-1/shopping-carts/current"
```

You'll see the cart document with `product-1`, a quantity of `2`, and its `ETag`.

To deploy later changes, run `npm run deploy` again.

### Deploy with GitHub Actions

The repository-level [Cloudflare D1 workflow](../../../.github/workflows/build_and_test_sample_cloudflare-d1.yml) validates the sample and can deploy it. The deploy job runs the same `npm run deploy`.

The workflow needs your Account ID and the API token. `npx wrangler whoami` prints the Account ID.

GitHub Actions can't answer Wrangler's prompts, so the account needs a `workers.dev` subdomain before the first CI deploy. A local deploy registers one, or you can pick one under **Workers & Pages** in the dashboard.

In the repository that will deploy the sample, open **Settings → Secrets and variables → Actions** and add:

| Kind     | Name                        | Value                                                                                                              |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Variable | `CLOUDFLARE_DEPLOY_ENABLED` | `true`. Without it, the deployment job is skipped, which keeps ordinary forks validation-only.                     |
| Secret   | `CLOUDFLARE_ACCOUNT_ID`     | The Account ID printed by `npx wrangler whoami`.                                                                   |
| Secret   | `CLOUDFLARE_API_TOKEN`      | The API token you created while preparing the account. The workflow uses it to deploy the Worker and provision D1. |

The Durable Objects sample uses the same settings.

You can set them with the [GitHub CLI](https://cli.github.com/) instead:

```shell
gh variable set CLOUDFLARE_DEPLOY_ENABLED --body true
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set CLOUDFLARE_API_TOKEN
```

`gh secret set NAME` without `--body` prompts for the value, so the secret stays out of your shell history. Add `--repo owner/name` to each command if you run them outside the repository clone.

The workflow deploys in two cases:

- A push to `main` that changes the sample or the workflow.
- A manual run from `main`. Open **Actions → Build and test Sample - Cloudflare D1 → Run workflow**, choose the `main` branch, and run it. Or use `gh workflow run build_and_test_sample_cloudflare-d1.yml --ref main`.

Pull requests and manual runs from other branches only validate the sample. Configure the variable and secrets before merging the change that adds the sample; otherwise its push to `main` skips the deployment job. If that already happened, a manual run from `main` deploys it.

The job validates the sample, deploys and migrates it, and prints the deployment URL in the job log.

Protect the repository's `main` branch and require review for workflow changes, because a workflow running after merge can access deployment secrets.

Deployments from CI and from your machine to the same account update the same Worker.

### Worker name and database

Wrangler deploys the Worker named `pongo-shopping-cart-d1` into the selected account. With `workers_dev: true`, its URL is normally:

```text
https://pongo-shopping-cart-d1.<your-workers-subdomain>.workers.dev
```

If the account already has a Worker with that name, change `name` in [`wrangler.jsonc`](./wrangler.jsonc) before the first deployment; otherwise the sample replaces it.

The checked-in `DB` binding has no database ID, so the first deployment provisions a D1 database and binds it. Later deployments reuse the binding Cloudflare stored. The dashboard shows the generated database ID; the sample leaves it out of `wrangler.jsonc` so the configuration works in any account.

### Copy the sample to its own repository

If you copy this sample as a separate repository, also copy the workflow into `.github/workflows`. When the sample is no longer under `samples/cloudflare/d1`, update the workflow's path filters, `working-directory`, Node version file path, and lockfile path. A fork deploys to its own account once it sets `CLOUDFLARE_DEPLOY_ENABLED` and supplies its own secrets.

### Clean up

If GitHub Actions deploys the sample, turn that off first, or the next push to `main` recreates the Worker:

```shell
gh variable delete CLOUDFLARE_DEPLOY_ENABLED
```

Delete the Worker:

```shell
npx wrangler delete
```

Deleting the Worker keeps its D1 database. Find the database's name, then delete it:

```shell
npx wrangler d1 list
npx wrangler d1 delete <database-name>
```

## Further reading

- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Deploy Workers with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Wrangler automatic resource provisioning](https://developers.cloudflare.com/changelog/post/2025-10-24-automatic-resource-provisioning/)
- [Emmett Getting Started](https://event-driven-io.github.io/emmett/getting-started.html), which inspired how this sample presents its API and tests it
