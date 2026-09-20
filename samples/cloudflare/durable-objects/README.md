# Pongo on Cloudflare Durable Objects

A shopping cart API for Cloudflare Workers. Each cart is a document stored in a Durable Object's SQLite storage through [Pongo](https://github.com/event-driven-io/Pongo), with [Hono](https://hono.dev/) routing requests and [Emmett](https://event-driven-io.github.io/emmett/) handling the HTTP details and the tests.

It is a complete service, kept small enough to read in one sitting: the cart rules, the HTTP API, the database schema, unit, integration and end-to-end tests, and a GitHub Actions workflow that deploys it to a public URL.

What it shows:

- storing and changing a document in a Durable Object with Pongo, without writing SQL or mapping code,
- keeping concurrent changes to the same cart safe, using Pongo's version check and the `ETag` and `If-Match` headers,
- running the same cart code on another store: the [D1 sample](../d1/README.md) shares the business logic and its unit tests, and differs only in how storage is wired.

## Why Pongo and Emmett

A Durable Object's storage is SQLite. A cart is a small object with a list of products in it, so keeping it in SQL means at least two tables, a join to read a cart back, an insert, update or delete per product line, and a version column you maintain yourself so two concurrent requests do not overwrite each other's changes.

Pongo stores the cart as a single document and handles that last part. A function in [`businessLogic.ts`](./src/shoppingCarts/businessLogic.ts) receives the cart that was read and returns the changed cart, and `handle` saves it only if nobody changed it first. If somebody did, it throws, and the API answers `412 Precondition Failed`. Pongo's collection API is the same on Durable Object SQLite, on D1 and on PostgreSQL.

Hono routes the request and Pongo stores the cart. Emmett fills the gap between them: it reads `If-Match`, writes `ETag`s, turns a concurrency conflict into `412` and a rejected business rule into `409`, and formats errors as problem details. That keeps try/catch out of the routes. Emmett also provides the test API, so [`api.int.spec.ts`](./src/shoppingCarts/api.int.spec.ts) states a request and the response it expects, and runs it against the real Worker.

## How the cart is modelled

A cart is one document: the client it belongs to, its status, its product lines with the unit price captured when each product was added, and the resulting item count and total amount. Everything a request reads or changes is in that document.

A client's first product opens a cart, and the response gives its permanent URL. Confirming or cancelling a cart does not delete it: the status changes, the cart stays readable under the same URL, and the client has no open cart again, so the next product added through `/current` opens a new one. A partial unique index declared in [`pongo.config.ts`](./src/pongo.config.ts) keeps a client from ever having two open carts.

Prices are integers in minor units, so `1000` means 10.00. Clients send a product ID and a quantity, never a price. [`pricing.ts`](./src/shoppingCarts/pricing.ts) knows `product-1` at `1000` and `product-2` at `2500`, and the price is copied into the cart when the product first enters it.

## Actor-like Durable Object boundary

The front-door Worker routes every request for a client through `SHOPPING_CARTS.getByName(clientId)`. Cloudflare therefore places that client's operations on one `ShoppingCartDurableObject`, which coordinates discovery and creation of the client's single active cart.

`ShoppingCartDurableObject` is the Cloudflare unit that hosts a client's carts; the consistency boundary is still the `ShoppingCart` document with its permanent ID. One client-keyed object can retain confirmed carts and create later carts with new IDs. Each object owns isolated SQLite storage and uses Pongo's `cloudflareDurableObjectSQLiteDriver` over `ctx.storage`.

The Worker resolves product prices before making typed RPC calls to the Durable Object. The object exposes only the shopping-cart use cases and stores their results; HTTP routing and pricing stay in the Worker.

## HTTP API

| Use case                                                   | Request                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Add a product to the current cart, opening one when needed | `POST /clients/:clientId/shopping-carts/current/product-items`                                 |
| Find the current cart and its permanent ID                 | `GET /clients/:clientId/shopping-carts/current`                                                |
| Get a cart by its permanent ID                             | `GET /clients/:clientId/shopping-carts/:shoppingCartId`                                        |
| Add a product to a known cart                              | `POST /clients/:clientId/shopping-carts/:shoppingCartId/product-items`                         |
| Remove a quantity from a product line                      | `DELETE /clients/:clientId/shopping-carts/:shoppingCartId/product-items/:productId?quantity=N` |
| Confirm a cart                                             | `POST /clients/:clientId/shopping-carts/:shoppingCartId/confirm`                               |
| Cancel an opened cart                                      | `POST /clients/:clientId/shopping-carts/:shoppingCartId/cancel`                                |

Product additions use a JSON body such as:

```json
{
  "productId": "product-1",
  "quantity": 2
}
```

Every route returns the cart in the response body, as Stripe, BigCommerce and commercetools do, so a client sees the cart's ID and its new totals without reading it again. Adding a product through `/current` returns `201 Created` with the cart's permanent URL in `Location` when it opened the cart, and `200 OK` when it added to a cart that was already open. Every other route returns `200 OK`.

Responses carry the cart's version as a weak `ETag`, such as `W/"3"`. Send that value back in `If-Match` when you change a cart through its permanent URL. You get `412 Precondition Failed` if the cart changed in the meantime, `404 Not Found` if it does not exist, and `409 Conflict` if its current state forbids the change, such as confirming an empty cart. Errors are problem details ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)).

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

Each Durable Object has its own private database, including objects created long after the Worker was deployed. Pongo therefore uses `autoMigration: "None"` and runs `db.schema.migrate()` inside `ctx.blockConcurrencyWhile()` when an object activates. The object receives requests only after its collection, migration ledger, and partial unique index are ready.

Wrangler provisions the SQLite-backed Durable Object namespace from the declarative `exports` configuration in [`wrangler.jsonc`](./wrangler.jsonc). Together with Pongo's per-object migration, that is all the storage setup the sample needs.

## Production pricing boundary

The in-memory pricing lookup keeps this sample self-contained. In a production system, pricing would commonly be owned by another Worker and reached through a typed [Service Binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/):

```ts
import { env } from 'cloudflare:workers';

const getUnitPrice = (productId: string) => env.PRICING.getUnitPrice(productId);
```

[`index.ts`](./src/index.ts) is the only place that reads `env`; it passes `getUnitPrice` to the API like every other dependency.

Only the price source changes; the shopping-cart business logic and actor boundary stay the same.

## Run locally

Use the Node version from [`.nvmrc`](./.nvmrc), then install and start the Worker:

```shell
npm ci
npm run dev
```

Wrangler prints the local URL, normally `http://localhost:8787`. Everything runs on your machine: Wrangler simulates the Durable Object namespace, and each object creates its schema on first use. Local data is kept under the ignored `.wrangler/state` directory.

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

This sample has no end-user authentication or authorization. A deployed `workers.dev` endpoint is public, so use an isolated development account and synthetic data only. Only GitHub Actions holds the Cloudflare API token. Keep it out of source control and logs, grant it only the account permissions the workflow requires, protect `main`, and review changes to deployment workflows before merging them.

## Deploy to Cloudflare

This tutorial deploys the sample to a public `workers.dev` URL, first from your terminal, then from GitHub Actions on every change merged to `main`.

### Prepare your Cloudflare account

The [Cloudflare D1 sample](../d1/README.md) uses the same account and API token.

1. Create a [Cloudflare account](https://dash.cloudflare.com/sign-up). The free plan supports SQLite-backed Durable Objects.
2. If you'll deploy through GitHub Actions, create an API token:
   - Go to **My Profile → API Tokens → Create Token**.
   - Pick the **Edit Cloudflare Workers** template. Its **Workers Scripts: Edit** permission also covers Durable Object namespaces.
   - If you'll deploy the D1 sample with the same token, add **Account → D1 → Edit**.
   - Under **Account Resources**, include only this account.
   - Under **Zone Resources**, choose **Include → All zones from an account → your account**. The template includes zone permissions for Workers Routes, so Cloudflare requires a zone selection even though the sample deploys only to `workers.dev`.
   - Create the token and copy it. Cloudflare shows it only once.
   - Don't use a Global API Key.
3. Use an isolated development account if you can. The deployed API is public and has no authentication; see [Security scope](#security-scope).

### Deploy from your machine

Install dependencies, log in, and deploy:

```shell
npm ci
npx wrangler login
npm run deploy
```

`wrangler login` opens your browser to authorize Wrangler. During the deploy, Wrangler asks which account to use if your login can reach several, and offers to register a `workers.dev` subdomain if the account has none yet. It then prints the Worker's URL:

```text
https://pongo-shopping-cart-durable-objects.<your-workers-subdomain>.workers.dev
```

Each Durable Object creates its own schema the first time it starts, so deploying is the only step. See [Per-object schema migration](#per-object-schema-migration).

Check the deployed API against the URL Wrangler printed:

```shell
url=https://pongo-shopping-cart-durable-objects.<your-workers-subdomain>.workers.dev

curl -i --request POST "$url/clients/client-1/shopping-carts/current/product-items" \
  --header 'Content-Type: application/json' \
  --data '{"productId":"product-1","quantity":2}'
```

You'll see `201 Created` with the new cart in the body and its permanent URL in `Location`. Then read the current cart:

```shell
curl -i "$url/clients/client-1/shopping-carts/current"
```

You'll see `200 OK`, the cart document, and its `ETag`.

To deploy later changes, run `npm run deploy` again.

### Deploy with GitHub Actions

The repository-level [Cloudflare Durable Objects workflow](../../../.github/workflows/build_and_test_sample_cloudflare-durable-objects.yml) validates the sample and can deploy it.

The workflow needs your Account ID and the API token. The token is the only value you take from the dashboard; `npx wrangler whoami` prints the Account ID.

GitHub Actions can't answer Wrangler's subdomain prompt, so the account needs a `workers.dev` subdomain before the first CI deploy. A local deploy registers one, or you can pick one under **Workers & Pages** in the dashboard.

In the repository that will deploy the sample, open **Settings → Secrets and variables → Actions** and add:

| Kind     | Name                        | Value                                                                                                                         |
| -------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Variable | `CLOUDFLARE_DEPLOY_ENABLED` | `true`. Without it, the deployment job is skipped, which keeps ordinary forks validation-only.                                |
| Secret   | `CLOUDFLARE_ACCOUNT_ID`     | The Account ID printed by `npx wrangler whoami`.                                                                              |
| Secret   | `CLOUDFLARE_API_TOKEN`      | The API token you created. It must be scoped to that account with permission to deploy Workers and Durable Object namespaces. |

The D1 sample uses the same settings.

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

Pull requests and manual runs from other branches only validate the sample. Configure the variable and secrets before merging the change that adds the sample; otherwise its push to `main` skips the deployment job. If that already happened, a manual run from `main` deploys it.

The job validates the sample and deploys it with the same `npm run deploy` you run locally. Wrangler prints the deployment URL in the job log.

Protect the repository's `main` branch and require review for workflow changes, because a workflow running after merge can access deployment secrets.

Deployments from CI and from your machine to the same account update the same Worker.

### Worker name and Durable Object namespace

Wrangler deploys the Worker named `pongo-shopping-cart-durable-objects` into the selected account. With `workers_dev: true`, its URL is normally:

```text
https://pongo-shopping-cart-durable-objects.<your-workers-subdomain>.workers.dev
```

If the account already has a Worker with that name, change `name` in [`wrangler.jsonc`](./wrangler.jsonc) before the first deployment; otherwise the sample replaces it.

On the first deployment, Wrangler reads the declarative `ShoppingCartDurableObject` export, provisions its SQLite-backed namespace, and binds it as `SHOPPING_CARTS`. Later deployments reconcile the same declaration. Each object creates its database and Pongo schema when it first activates.

### Copy the sample to its own repository

If you copy this sample as a separate repository, also copy the workflow into `.github/workflows`. When the sample is no longer under `samples/cloudflare/durable-objects`, update the workflow's path filters, `working-directory`, Node version file path, and lockfile path. A fork deploys to its own account once it sets `CLOUDFLARE_DEPLOY_ENABLED` and supplies its own secrets.

### Clean up

Delete the Worker:

```shell
npx wrangler delete
```

After you confirm, Wrangler deletes the Worker with its Durable Object namespace and every cart stored in it. You can't undo this.

If GitHub Actions deploys the sample, turn that off first, or the next push to `main` recreates the Worker:

```shell
gh variable delete CLOUDFLARE_DEPLOY_ENABLED
```

## Further reading

- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Durable Object design rules and best practices](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
- [Durable Object class exports](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
- [Workers RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/)
- [Deploy Workers with GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
- [Emmett Getting Started](https://event-driven-io.github.io/emmett/getting-started.html), which inspired this sample's presentation and tests
