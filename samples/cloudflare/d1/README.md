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

Production migration is part of deployment. After deploying, the GitHub Actions workflow or `npm run migrate` calls the bearer-protected `POST /_system/migrations` operational endpoint once. That endpoint runs Pongo's schema migration, including the collection, migration ledger, and partial unique index. It is not part of the public shopping-cart API, and there are no duplicate Wrangler SQL migrations.

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

## Deploy to Cloudflare

This tutorial deploys the sample to your Cloudflare account, first from your machine and then from GitHub Actions. You can stop after either part.

### Prepare your Cloudflare account

Do this once. The same account and API token also serve the Durable Objects sample.

1. Create a [Cloudflare account](https://dash.cloudflare.com/sign-up). The free plan is enough for Workers and D1.
2. Open **Workers & Pages** in the dashboard and pick a `workers.dev` subdomain. Cloudflare asks for it the first time you open that page. Deployed Workers get URLs under this subdomain.
3. Copy your **Account ID**. You'll find it in the sidebar of the account home page and on the **Workers & Pages** overview.
4. If you'll deploy through GitHub Actions, create an API token. Go to **My Profile → API Tokens → Create Token** and start from the **Edit Cloudflare Workers** template. Add the permission **Account → D1 → Edit**: the template doesn't include D1, and the first deployment creates the database. Under **Account Resources**, select only this account. Leave **Zone Resources** as the template allows, either all zones or none. Don't use a Global API Key. Copy the token when Cloudflare shows it, because it's shown only once. Skip this step if you'll deploy only from your machine.
5. Prefer a separate development account. The deployed API has no authentication and is public, as explained in [Security scope](#security-scope).

### Deploy from your machine

1. Install the dependencies:

   ```shell
   npm ci
   ```

2. Log in to Cloudflare:

   ```shell
   npx wrangler login
   ```

   Wrangler opens your browser and asks you to authorize it. Run `npx wrangler whoami` to see which account you're logged in to. If you have access to several accounts, set the `CLOUDFLARE_ACCOUNT_ID` environment variable to the Account ID you copied earlier.

3. Deploy the Worker:

   ```shell
   npm run deploy
   ```

   On the first deployment, Wrangler provisions a D1 database for the `DB` binding. In an interactive terminal it may ask whether to create a new database or use an existing one; choose to create a new one. When it finishes, Wrangler prints the Worker URL:

   ```text
   https://pongo-shopping-cart-d1.<your-workers-subdomain>.workers.dev
   ```

4. Generate a migration token and store it as a Worker secret:

   ```shell
   export MIGRATION_TOKEN=$(openssl rand -hex 32)
   echo "$MIGRATION_TOKEN" | npm run secret:migration-token
   ```

   Wrangler confirms that it uploaded the `MIGRATION_TOKEN` secret.

5. Run the Pongo schema migration against the deployed Worker, in the same terminal so `MIGRATION_TOKEN` is still set:

   ```shell
   export DEPLOYMENT_URL=https://pongo-shopping-cart-d1.<your-workers-subdomain>.workers.dev
   npm run migrate
   ```

   The endpoint returns `204 No Content`, so a successful migration prints nothing after the npm script line. A freshly deployed `workers.dev` URL can briefly return `404`, so the script retries up to five times; the migration is idempotent, which makes retrying safe. Failures retry too, so a `401` error appears after roughly 30 seconds. It means the token you sent doesn't match the Worker secret.

6. Start a cart on the deployed Worker:

   ```shell
   curl -i --request POST "${DEPLOYMENT_URL}/clients/client-1/shopping-carts/current/product-items" \
     --header 'Content-Type: application/json' \
     --data '{"productId":"product-1","quantity":2}'
   ```

   You'll see `201 Created` with the permanent cart URL in `Location`. Then read the current cart:

   ```shell
   curl -i "${DEPLOYMENT_URL}/clients/client-1/shopping-carts/current"
   ```

   You'll see the cart document with `product-1`, a quantity of `2`, and its `ETag`.

To deploy a later change, run `npm run deploy` and then `npm run migrate` again. Running the migration more than once is safe. The Worker secret stays in place between deployments, so keep the migration token, for example in a password manager, or set a new one by repeating step 4.

### Deploy with GitHub Actions

Production deployment is defined in the repository-level [Cloudflare D1 workflow](../../../.github/workflows/build_and_test_sample_cloudflare-d1.yml).

In the repository that will deploy the sample, open **Settings → Secrets and variables → Actions** and configure:

| Name                         | Kind     | Value and purpose                                                                                                                                                            |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_DEPLOY_ENABLED`  | Variable | `true`. Without it, the deployment job is skipped, which keeps ordinary forks validation-only.                                                                               |
| `CLOUDFLARE_ACCOUNT_ID`      | Secret   | The Account ID of the target Cloudflare account.                                                                                                                             |
| `CLOUDFLARE_API_TOKEN`       | Secret   | The API token you created while preparing the account. The workflow uses it to deploy the Worker and provision D1.                                                           |
| `CLOUDFLARE_MIGRATION_TOKEN` | Secret   | An independent random value, for example one produced by `openssl rand -hex 32`. The workflow stores it as the Worker's `MIGRATION_TOKEN` secret. Don't reuse the API token. |

You can set the same values with the [GitHub CLI](https://cli.github.com/) from inside your clone:

```shell
gh variable set CLOUDFLARE_DEPLOY_ENABLED --body true
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set CLOUDFLARE_API_TOKEN
openssl rand -hex 32 | gh secret set CLOUDFLARE_MIGRATION_TOKEN
```

`gh secret set NAME` without `--body` prompts for the value, so the secret doesn't end up in your shell history. Add `--repo owner/name` to each command if you run them outside the clone.

The workflow deploys in two cases:

- A push to `main` that changes the sample or the workflow.
- A manual run from `main`. Open **Actions → Build and test Sample - Cloudflare D1 → Run workflow**, select the `main` branch, and confirm. Or run `gh workflow run build_and_test_sample_cloudflare-d1.yml --ref main`.

Pull requests and manual runs from other branches only validate the sample. Configure the variable and secrets before merging the change that adds the sample; otherwise the deployment job is skipped. If you missed that, a manual run from `main` deploys it.

A deploying run validates the sample, deploys the Worker, sets the `MIGRATION_TOKEN` Worker secret, calls the migration endpoint, and writes the deployment URL to the job summary.

Protect the repository's `main` branch and require review for workflow changes, because a workflow running after merge can access deployment secrets.

GitHub Actions and your machine update the same Worker when they use the same account. Each workflow deployment overwrites the Worker's `MIGRATION_TOKEN` secret with `CLOUDFLARE_MIGRATION_TOKEN`, so the last deployment's token wins. If you use both, either set the same value in both places or leave migrations to the workflow.

### Worker name and database

Wrangler deploys the Worker named `pongo-shopping-cart-d1` into the selected account. With `workers_dev: true`, its URL is normally:

```text
https://pongo-shopping-cart-d1.<your-workers-subdomain>.workers.dev
```

Change `name` in [`wrangler.jsonc`](./wrangler.jsonc) before deploying if that Cloudflare account already contains a Worker with this name; deploying the sample updates the same named Worker.

The first deployment automatically provisions and binds the remote D1 database because the checked-in `DB` binding intentionally has no account-specific database ID. Later deployments reuse the binding stored by Cloudflare. The generated database ID is visible in the Cloudflare dashboard but is not written into this portable sample.

### Copy the sample to its own repository

If you copy this sample as a separate repository, also copy the workflow into `.github/workflows`. When the sample is no longer under `samples/cloudflare/d1`, update the workflow's path filters, `workingDirectory`, Node version file path, and lockfile path. There is no repository-name condition to replace: a fork deploys to its own account once it explicitly enables deployment and supplies its own secrets.

### Clean up

Delete the Worker:

```shell
npx wrangler delete
```

Find the name of the provisioned database, then delete it:

```shell
npx wrangler d1 list
npx wrangler d1 delete <database-name>
```

To stop GitHub Actions from deploying, remove the variable:

```shell
gh variable delete CLOUDFLARE_DEPLOY_ENABLED
```

## Security scope

This sample has no end-user authentication or authorization. A deployed `workers.dev` endpoint is public, so use an isolated development account and synthetic data only. The migration endpoint is protected by its independent Worker secret, while the Cloudflare API token is stored only in GitHub Actions; local deployments use `wrangler login` instead. Keep both tokens out of source control and logs, and grant the API token only the account permissions the workflows require.

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
