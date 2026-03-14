# Pongo 2nd Level Cache — Brainstorm Q&A

## Q1: Cache library choice — lru-cache, keyv, or custom interface?

**Question:** You mentioned both `keyv` and `lru-cache`. They pull in different directions. Which trade-off do you prefer?
- A) Start with `lru-cache`, optionally let users swap adapters later.
- B) Start with `keyv` so cross-node sharing works out of the box.
- C) Define a thin cache interface (`get`/`set`/`delete`/`clear`) and ship `lru-cache` as the default adapter.

**Answer:** Custom cache interface (option C). No dependency on external APIs — keep it pluggable. Start with an in-memory provider only. Considered writing a custom LRU with me, but wants to ship fast. Key point: don't stick to any third-party API surface, allow pluggability.

## Q2: Where should the cache live in Pongo's hierarchy?

**Question:** Three attachment points: A) PongoClient level (shared across all), B) PongoDb level (per database), C) PongoCollection level (per collection). Or configurable at multiple levels?

**Answer:** Allow defining it at different levels — cascading configuration. Set a default higher up, override per collection if needed.

## Q3: Inheritance/override behavior for cascading cache config?

**Question:** For the cascading config — what should the inheritance/override behavior be?

Two sub-questions:
1. Should a lower level be able to *disable* caching even if a parent enables it?
2. Should cache *settings* (like max size, TTL) also cascade, or only the cache provider instance itself?

**Answer:**
1. Yes. Cache should be an object with type, general params and specific for this type, or `'disabled'`. That's a proper devex.
2. Yes, as above. But if one selects a different cache type then general params should be inherited but type-specific should not be inherited and should fallback to defaults.

**Claude's thoughts:** The `CacheConfig | 'disabled'` pattern is clean — discriminated unions play nicely with TypeScript. The inheritance rule makes sense: general params (TTL, max size) cascade, but type-specific params reset to defaults when you switch providers, avoiding leaking nonsensical config (e.g., a Redis connection string bleeding into an in-memory cache). Also worth distinguishing between "I didn't specify anything" (inherit from parent via `undefined`) and "I explicitly want defaults" (reset) — `undefined` vs `'disabled'` vs `CacheConfig` gives a clean three-state: inherit / off / explicit.

## Q4: Cache interface shape — async, batch ops, scoping?

**Question:** Settling the cache interface details:
1. Async or sync? Making the interface `Promise`-based from the start keeps it pluggable. Sound right?
2. Batch methods (`getMany`, `setMany`, `deleteMany`) — should the cache interface support batch ops natively, or loop internally?
3. Should `clear()` be scoped per collection, or always clear the entire cache?

**Answer:**
1. Maybe we could return either promise or no promise, then if we await it, it would support both? Also ensure that settings are close to what lru-cache and keyv are having.
2. Having them (even as syntactic sugar) would be a good devex.
3. We could pass down not only settings, but also the cache provider instance, then if settings are the same we can reuse cache without recreating it. If set had ttl provided, then we could do it by overriding those TTLs on item level. ClearAll probably would be something we should expose only for advanced, typically user should not be aware of cache.

**Claude's thoughts:** `MaybePromise<T>` (i.e. `T | PromiseLike<T>`) works — `await` on a non-Promise just resolves immediately. No overhead for sync providers, no breaking change for async ones. Passing a cache instance is smart: config becomes either settings (Pongo creates the cache) or a pre-built instance (user brings their own). Multiple collections can explicitly share one cache instance. `clear()` should be internal/advanced — scope by collection prefix internally so a collection-level clear doesn't nuke another collection's entries when sharing an instance. For aligning with lru-cache/keyv settings: both support `max` (max entries) and `ttl` (TTL in ms). Start with `max` and `ttl` as the general params.

## Q5: Cache key strategy

**Question:** Since cache instances might be shared across collections, how to avoid key collisions?
- A) Pongo manages key prefixing internally (`{dbName}:{collectionName}:{id}`). The cache interface works with plain string keys, namespacing is Pongo's concern.
- B) Key is just the document `_id`. Simpler but only safe with per-collection instances.

**Answer:** A, definitely.

## Q6: Cache invalidation and consistency with optimistic concurrency

**Question:** How should cache interact with different operations?
1. Successful writes → update/evict cache. Clear.
2. Concurrency errors → evict stale entry. Clear.
3. Reads with `_id` filter → cache hit or miss-then-populate. Clear.
4. `handle` method — should the read inside `handle` use the cache (risking more concurrency errors on stale data) or always go to DB?

**Answer:** Definitely use cache. We could consider disabling cache through handle options.

**Claude's thoughts:** Use cache by default — optimistic concurrency is the safety net. If cached version is stale, write fails, we evict, caller can retry. Adding `skipCache?: boolean` to `HandleOptions` is a clean escape hatch for high-contention cases.

## Q7: Should `skipCache` be available on read methods too?

**Question:** Should `skipCache` also be available on `findOne` and other read methods for symmetry, or keep it `handle`-only?

**Answer:** Good point, having `skipCache` on find methods (also `findMany` etc.) would be good.

**Claude's thoughts:** Consistent API surface. Add `skipCache?: boolean` on the shared options type (e.g. `CollectionOperationOptions`) so it's available everywhere without repeating yourself.

## Q8: Batch operations on `handle` — signature and handler shape

**Question:** You want `handle` to accept an id or array of ids. Two design choices:
1. Overloaded signature (`handle(id: string | string[], ...)`) vs separate method (`handleMany`)?
2. Handler shape for batch: A) still receives/returns one document at a time (Pongo batches DB ops internally) or B) receives/returns full array?

Also noted: since PongoDocuments always have `_version`, if someone provides `expectedVersion` we could compare it against the cached version and decide if it's stale without hitting the DB.

**Answer:** Option A for handler shape. `handleMany` would be consistent with other APIs, but single id or array (`string | string[]`) is clean enough.

**Claude's thoughts:** Version comparison in cache is a cheap short-circuit — if cached `_version` doesn't match `expectedVersion`, we know it's stale without a round trip. On signature: TypeScript overloads can narrow the return type (`string` → single result, `string[]` → array). `handle` is a higher-level orchestration method, not direct CRUD, so a union input feels natural. Go with `handle(id: string | string[], handler, options?)`.

## Q9: Defaults — max entries, TTL, enabled by default?

**Question:** What defaults to set? Proposed: `max: 1000`, `ttl: 60_000` (1 min), and should cache be enabled by default or opt-in?

**Answer:** Stick to recommended lru-cache defaults for now. Enable cache by default.

**Claude's thoughts:** Enabling by default works because: (1) optimistic concurrency is always the safety net, (2) it's document-by-id only so invalidation is straightforward, (3) users can set `'disabled'`. `lru-cache` requires `max` to be set (no default) and has no default TTL. Suggested: `max: 1000`, no TTL (rely on LRU eviction + invalidation on writes/concurrency errors) — most lru-cache-aligned.

## Q10: TTL or no TTL as staleness backstop?

**Question:** No TTL means cached entries live until LRU-evicted or invalidated by a Pongo write. If something updates the DB outside this Pongo instance (another service, direct SQL), the cache won't know. Options:
- A) No TTL, accept the trade-off — OC catches it on next write.
- B) Set a conservative default TTL (e.g., 5 minutes) as a staleness bound.

**Answer:** Fine with using TTL and sometimes hitting OC issue. OC assumes rare conflicts.

## Q11: Where does cache integration hook into existing code?

**Question:** Two approaches for minimal invasiveness:
1. Wrap at the `pongoCollection` level — intercept operations inside the factory function, driver/SQL layers untouched.
2. Decorator/wrapper pattern — `cachedPongoCollection` wraps `PongoCollection`, adds cache logic around delegation.

**Answer:** Leaning more to option 1. Thinks it'll be easier to make observability precise eventually.

**Claude's assessment:** Agreed with option 1. Cache decisions depend on internal state (whether filter targets `_id`, document `_version`, write success vs concurrency error). A wrapper would need to re-inspect all of that from the outside. For observability, cache hit/miss logic next to the actual DB call enables precise metrics in context. Pongo's factory functions already compose behavior internally (transactions, schema migration) — cache is another concern at the same level. A decorator would duplicate filter-inspection logic and add indirection that doesn't carry its weight.

## Q12: Cache interaction with transactions

**Question:** How should cache interact with transactions?
1. Should writes within a transaction update the cache immediately, or only after commit?
2. Should reads within a transaction check the cache?

**Answer:**
1. After commit.
2. We should use cache, but allow skipping it on transaction or session options. We can also allow setting cache settings per session.

**Claude's thoughts:** Reads within a transaction benefiting from cache is more aggressive but logical — most transactions are short-lived. The narrow case: `insertOne` then `findOne` same `_id` within a transaction — cache won't have the uncommitted insert, falls through to DB, gets the right answer anyway. No correctness issue, just no perf benefit for that case. Per-session cache settings fit the cascading pattern (e.g., `startSession({ cache: 'disabled' })` for batch migrations). Proposed cascade priority: client → db → collection → session → per-operation `skipCache`.

## Q13: Cascade priority — does session override collection?

**Question:** Does the cascade priority **client → db → collection → session → per-operation `skipCache`** feel right? Session overriding collection is the non-obvious part — the argument being that session is the most immediate runtime context, while collection is structural config. Or would you prefer collection always wins over session?

**Answer:** That's fine. Session should precede collection, as normally you create session to e.g. share connection, and join the number of operations logically, so it'd make sense actually to also do it to e.g. override settings like caching.

**Claude's thoughts:** Session as logical grouping of operations with shared context (connection, transaction) — overriding cache settings at that level is extending the same concept. Bulk import in a session? Set cache disabled once on the session instead of `skipCache` on every call. Final cascade: client → db → collection → session → per-operation.

## Q14: Cache provider error handling

**Question:** If the cache provider throws (e.g., Redis connection drops), should Pongo:
- A) Treat it as a cache miss — fall through to DB silently, maybe log a warning. Cache failures never break the application.
- B) Propagate the error — let the caller deal with it.

**Answer:** A — yes, when we add observability to Pongo, we need to make it also a metric and trace event/attribute/log entry.

**Claude's thoughts:** Cache is an optimization, not a correctness requirement. Silent degradation now, observable degradation when the observability layer lands.

## Q15: Cache warming, events/hooks, and delete operations

**Question:** Three remaining areas:
1. Cache warming — should Pongo support pre-populating the cache on startup?
2. Cache events/hooks — should users be able to listen to cache hits/misses/evictions?
3. Delete operations — `deleteOne`/`deleteMany` should evict from cache. Anything non-obvious there?

**Answer:**
1. For now keep it as a future concept, or define pluggable strategy for users.
2. You can add the basic hook to the Pongo Cache wrapper. Shouldn't be that hard to just call some function.
3. Yes, they should evict if they can, we can delete (for now) when `deleteMany` deletes by ids.

**Claude's thoughts:** Cache warming deferred — can add a strategy hook later. Basic event callbacks (onHit, onMiss, onEvict, onError) on the cache wrapper are low-cost and useful for debugging even before full observability. Delete eviction scoped to id-based deletes for now — filter-based `deleteMany` doesn't evict (no way to know which ids were affected without querying first).
