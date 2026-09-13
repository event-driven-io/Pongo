# Brainstorm Q&A

## 1. Sample structure

**Question:** Should we create two standalone Cloudflare Worker samples sharing the shopping-cart domain and HTTP contract—one backed by D1 and one by Durable Object SQLite—or one combined CQRS sample where Durable Objects handle writes and D1 serves cross-cart queries?

**Answer:** Create two standalone samples.

## 2. Durable Object partitioning

**Question:** For the Durable Object sample, should one object own all shopping carts for a client, allowing queries such as open cart and cart history, or should each cart have its own object with only cart-local reads?

**Answer:** Use an actor-like Durable Object design. Prefer one object per client so it can own that client's shopping carts and support both commands and client-local queries, provided this aligns with Cloudflare's intended model.

## 3. Sample scope and domain source

**Question:** Besides the two Cloudflare samples, should the specification include a third standalone Node.js sample using the local `sqlite3` driver?

**Answer:** No. Focus on the two Cloudflare samples for now. Reuse the Shopping Cart domain and business logic from the supplied CRUD article, informed by the Emmett getting-started example. Do not introduce invented abstractions such as `ShoppingCartOwner`, use event sourcing, return events, or add an `evolve` function. Commands should return the resulting document for Pongo persistence.

## 4. Durable Object boundary

**Question:** Should the Durable Object sample use one Durable Object instance per shopping cart, selected by `shoppingCartId`?

**Answer:** Yes. Each Durable Object represents one shopping cart and is addressed by its `shoppingCartId`.

## 5. Opening a shopping cart

**Question:** Should the create endpoint require the first product item and open the cart through `addProductItem`, or should it create an explicitly empty cart?

**Answer:** The first `addProductItem` operation should perform the create-or-update flow. When the cart document does not exist, the domain function returns a new opened cart and Pongo inserts it; subsequent additions update it. Do not add a separate open command or create an empty cart.

## 6. Query scope

**Question:** Should the samples intentionally demonstrate different query scopes—both provide `GET` by `shoppingCartId`, while only D1 also provides a filtered list of carts—or should both samples expose exactly the same HTTP API?

**Answer:** Demonstrate the different query scopes. Both samples read an individual cart by ID. The D1 sample additionally demonstrates a collection query; the Durable Object sample remains cart-local because separate objects cannot be queried as one database.

## 7. D1 collection query

**Question:** Should the D1 collection query be client-scoped, with optional filters such as status and minimum total amount and results sorted newest first, or should it be global/admin-style?

**Answer:** Keep it client-scoped. Provide a query such as `GET /clients/:clientId/shopping-carts?status=Confirmed&minTotalAmount=100`, returning that client's matching carts newest first.

## 8. HTTP framework

**Question:** Should the Workers use native `fetch` routing with no web-framework dependency, or Hono for concise route definitions resembling the Emmett example?

**Answer:** Use Hono for both Cloudflare Worker samples.

## 9. Sample independence

**Question:** Should each sample contain its own small copy of the shopping-cart domain code, or should they depend on a shared sample package?

**Answer:** Keep a local copy in each sample. Each sample must be self-contained and independently runnable.

## 10. Product pricing

**Question:** Should each sample include a small in-memory product catalogue so the Worker resolves `unitPrice` from `productId`, as in the Emmett guide, or should callers provide the price?

**Answer:** Include a small in-memory product catalogue so the sample remains self-contained. Keep price resolution behind an explicit function boundary representing a production call to another service or Worker.

## 11. Production price-service guidance

**Question:** Should the README explicitly show how to replace the local catalogue with a Cloudflare Service Binding while leaving that binding unconfigured in the runnable sample?

**Answer:** Yes. Keep `getUnitPrice` asynchronous and locally backed for the runnable sample, and document a concise typed-RPC Service Binding replacement for production use.

## 12. HTTP validation and errors

**Question:** How much request validation and HTTP error handling should the samples include: only the happy path, or basic validation with meaningful `400`, `404`, and `409` responses?

**Answer:** Include basic validation and meaningful `400`, `404`, and `409` responses. Use a small RFC 9457-style JSON problem response without adding a validation library.

## 13. Successful command responses

**Question:** Should successful write endpoints return the resulting shopping-cart document, or follow command-style HTTP and return no body?

**Answer:** Return no response body for successful commands, but allow links pointing clients to relevant resources.

## 14. Command response links

**Question:** By links, should commands use HTTP headers—`Location` on creation and optionally `Link` on later commands—while keeping the response body empty?

**Answer:** Yes. Use response headers, specifically `Location`, and keep command response bodies empty.

## 15. Shopping cart identifiers

**Question:** Should the Worker generate a new `shoppingCartId` when handling the first product addition, or should the caller supply it?

**Answer:** Prefer a Worker-generated identifier, but verify whether a separate cart ID is necessary if the API always addresses a cart through `clientId`.

## 16. Successive carts

**Question:** Should the samples support multiple successive carts per client and therefore keep the Worker-generated `shoppingCartId`?

**Answer:** Yes. A client can have multiple carts over time, but should have only one active cart.

## 17. Active-cart consistency

**Question:** Should one active cart per client be an invariant enforced correctly under concurrent requests, or merely an API convention for the samples?

**Answer:** Enforce it as a consistency invariant. For Durable Objects, use `clientId` as the object identity so requests affecting a client's current cart are serialized within the same object.

## 18. Durable Object query scope after repartitioning

**Question:** Since a client-keyed Durable Object stores that client's successive carts, should both samples expose the same client-scoped filtered cart-history query?

**Answer:** Yes. Both samples should expose the same client-scoped history query. The Durable Object sample cannot perform cross-client queries, but those are outside the agreed API.

## 19. Enforcing one active cart in D1

**Question:** Should D1 protect the one-active-cart rule with a database-level partial unique index on `clientId` for documents whose status is `Opened`, returning concurrent conflicts as `409`?

**Answer:** Yes. Use the partial unique index both as a concurrency safeguard and as a showcase of Pongo schema indexes and migrations.

## 20. Removing product quantities

**Question:** Should `removeProductItem` decrease the matching line's quantity and remove that line when its quantity reaches zero, correcting the omission in the supplied article snippet?

**Answer:** Yes. Implement the expected partial- and complete-removal behavior and cover both cases with tests.

## 21. Cancellation persistence

**Question:** Should cancellation retain the article's `return null` behavior and delete the cart document, meaning cancelled carts do not appear in history, or should it preserve a `Cancelled` document?

**Answer:** Retain `return null`. Cancellation deletes the cart document and demonstrates Pongo's delete branch; cancelled carts are absent from history.

## 22. Idempotent commands

**Question:** Should repeated confirmation and repeated cancellation both succeed idempotently with `204`, exercising Pongo's no-op branch rather than returning an error?

**Answer:** Yes. Implement both operations idempotently and verify their repeated execution succeeds without additional state changes.

## 23. Test coverage

**Question:** Should each sample include focused unit tests for the shopping-cart functions and Cloudflare Worker integration tests covering HTTP behavior, persistence, filtering, idempotency, and concurrent active-cart creation?

**Answer:** Yes. Include unit tests and focused API-level tests covering those behaviors. Use `ApiSpecification` from `@event-driven-io/emmett-honojs` for the Hono API tests instead of creating a bespoke E2E harness.

## 24. Cart ID discovery

**Question:** Is the `Location` header returned by the first product addition, together with IDs returned by the client-scoped cart-list query, sufficient for clients to discover `shoppingCartId`?

**Answer:** Yes. Keep the command response body empty and expose the created cart URL through `Location`; list results allow later rediscovery.

## 25. Emmett Hono integration

**Question:** Should the samples use `getApplication`, response helpers, Problem Details handling, and `ApiSpecification` from `@event-driven-io/emmett-honojs`, while avoiding all event-sourcing features?

**Answer:** Yes. Use those HTTP and testing utilities, but do not use Emmett's event-sourcing types, stores, command handlers, deciders, or projections.

## 26. Documentation and CI

**Question:** Should the change add a `samples/README.md` linking both projects, in addition to a setup and deployment README inside each sample?

**Answer:** Yes. Add the sample index, detailed READMEs for both projects, and GitHub Actions coverage. Explain the domain, command/document flow, Pongo operations, and Cloudflare storage concepts in a style similar to Emmett's Getting Started guide.

## 27. GitHub Actions layout

**Question:** Should CI use one matrix workflow for both Cloudflare samples or follow the referenced Emmett convention?

**Answer:** Follow `/home/oskar/Repos/emmett/.github/workflows/build_and_test_sample_webapi-expressjs-with-esdb.yml`: create a dedicated path-filtered workflow per sample, set its sample directory as the default working directory, configure Node and npm caching from that sample's files, then install, type-check, lint, build, and test. Omit Docker-specific steps because Workers samples do not produce Docker images.

## 28. Sample locations

**Question:** Should the projects live at `samples/cloudflare/d1` and `samples/cloudflare/durable-objects`?

**Answer:** Yes. Use those directories, with each containing a standalone npm project.

## 29. Manual request walkthrough

**Question:** Should each sample include a `.http` file demonstrating the complete shopping-cart flow?

**Answer:** Yes. Include first addition, following the returned cart location, further add/remove operations, repeated confirmation, filtered history, repeated cancellation, and creation of the next cart.

## 30. Public current-cart lookup

**Question:** Should the API expose only a stable `/clients/:clientId/shopping-carts/current` resource, keep `shoppingCartId` internal, omit history, and keep Stripe as a README-only comparison?

**Answer:** Refine this model: expose a current-cart lookup that returns the cart ID, then allow operations using that ID. Decide whether the active cart is copied into another document when closed or is created under its final ID immediately.

## 31. Normal cart flow and document identity

**Question:** Should normal mutations use the cart ID obtained from the initial `Location` response, with `GET current` used only for recovery?

**Answer:** Yes. Keep the design practical and aligned with regular shopping-cart flows. The first product addition opens a cart under a permanent, server-generated ID and returns that ID in `Location`. Clients retain that ID for subsequent operations; `GET current` provides a convenient way to rediscover the active cart. A cart remains one self-contained document throughout its lifetime rather than being copied between `current` and archived documents.

## 32. Entry-point endpoint clarification

**Question:** Should `POST /clients/:clientId/shopping-carts/current/product-items` create the active cart when needed, add the product, and return its permanent ID-based URL for subsequent commands?

**Answer:** Not decided yet. The confirmation and cancellation flow must be made explicit before choosing this endpoint shape.

## 33. Permanent-ID cart lifecycle

**Question:** Does this lifecycle resolve the concern: first addition creates a permanent cart ID; confirmation updates that document to `Confirmed`; cancellation deletes the open document; and a later first addition creates a new cart ID?

**Answer:** Yes. Use this lifecycle. The active cart is discovered by querying for the client's open cart, not through a mutable pointer or by copying documents.

## 34. Cart query endpoints

**Question:** Should the sample expose both `GET /clients/:clientId/shopping-carts/current` for active-cart discovery and `GET /clients/:clientId/shopping-carts/:shoppingCartId` for reading the permanent resource referenced by `Location`?

**Answer:** Yes. Both endpoints reflect useful regular flows: recovery of the current cart and direct access to a known cart.

## 35. Command endpoint contract

**Question:** Should the remaining commands use an ID-based API for adding and removing products, confirmation, and cancellation, with unit prices resolved by the worker rather than accepted from clients?

**Answer:** Not decided. The user asked whether the specification had already been written before answering this endpoint question.

## 36. Specification readiness

**Question:** Are you ready for the agreed design to be consolidated into `spec.md`?

**Answer:** Yes.

## 37. Repository destination

**Question:** Should the specification be implemented in a new GitHub repository?

**Answer:** Not decided. Before answering, the user asked for the specification to explain concrete Cloudflare Worker setup, integration and E2E test provisioning, and deployment.

## 38. Operational Cloudflare design

**Question:** Should the Cloudflare setup, test provisioning, and deployment approach be researched and specified as executable configuration and commands?

**Answer:** Yes. Do proper research and make the specification operational rather than merely naming Wrangler and Cloudflare testing tools.

## 39. Versions, Emmett comparison, and provisioning choice

**Question:** Should the samples use the latest compatible tool versions, compare their integration and E2E provisioning with Emmett's actual D1 and Durable Object tests, and state whether Cloudflare resources are created with CLI commands?

**Answer:** Yes. Verify current package versions, inspect Emmett's concrete tests, and give an actionable recommendation for creating, testing, and deploying the Workers rather than leaving setup ambiguous.

## 40. Automated deployment

**Question:** Should deployment remain a documented manual Wrangler command?

**Answer:** No. Nobody should deploy the samples manually. Each dedicated GitHub Actions workflow must deploy its Worker after successful validation of a matching change on the upstream `main` branch.

## 41. Implementation-ready specification

**Question:** Should the specification contain enough information for an implementer to know exactly what to build and in what order without reconstructing decisions from the conversation?

**Answer:** Yes. Include concrete files, dependencies, configurations, test layers, resource provisioning, secrets, workflow triggers, deployment behavior, and acceptance checks.

## 42. Explicit Pongo migration

**Question:** Should D1 schema migration be left to an implicit first production request?

**Answer:** No. Configure Pongo with `autoMigration: "None"` and make GitHub Actions explicitly invoke `db.schema.migrate()` after deployment. Durable Object databases still need explicit migration during each object's activation because they are independent and may be created after deployment.

## 43. Zero-setup local development

**Question:** Should local development require copying `.dev.vars`, manually invoking a migration request, or treating `requests.http` as setup?

**Answer:** No. Local development must have no manual preparation or special migration ritual. `requests.http` is only an optional API walkthrough.

## 44. Local and deployment parity

**Question:** Should local D1 use a different auto-migration mode from deployed D1 to avoid manual setup?

**Answer:** No. Keep local behavior as close as practical to regular deployed behavior without adding setup chores. Deployment and tests use `autoMigration: "None"`; local development may select `CreateOrUpdate` through a simple environment check so the first normal operation initializes a fresh local database automatically.

## 45. D1 initialization scope

**Question:** Should the D1 sample maintain a `WeakMap` or runtime-container abstraction to cache initialization?

**Answer:** No. There is one D1 binding per Worker isolate. A single module-level Pongo database variable and a plain setup function are sufficient; do not introduce a `WeakMap` or invented runtime abstraction.

## 46. Local migration parity and developer experience

**Question:** Must local D1 use exactly the production migration trigger even if that adds a separate setup step?

**Answer:** No. Keep local usage as close as practical to deployment without trading away developer experience. A simple environment check is acceptable: local development may select `CreateOrUpdate` automatically, while tests and deployment select `None` and GitHub Actions explicitly run migration once.

## 47. Implementation starting point

**Question:** Should the Cloudflare samples use a newly invented file layout and tooling setup?

**Answer:** No. Start from `/home/oskar/Repos/emmett/samples/webApi/honojs-with-postgresql` or from the current Cloudflare-generated Hono Workers setup, then copy and modify the relevant existing files. The specification must identify those sources and adaptations explicitly rather than inventing `domain.ts`, `catalogue.ts`, `schema.ts`, or a separate test layout.
