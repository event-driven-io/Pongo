# Pongo 2nd Level Cache — TDD Implementation Plan

## Architecture Summary

Cache is a document-level (`_id`-keyed) optimization layer inside `pongoCollection`. Ships with an in-memory provider (`lru-cache`). Pluggable via `PongoCacheProvider` interface. Config cascades: client → db → collection → session → per-operation `skipCache`.

### Key Integration Points

- **Types**: `src/packages/pongo/src/core/typing/operations.ts`
- **Collection factory**: `src/packages/pongo/src/core/collection/pongoCollection.ts`
- **Database factory**: `src/packages/pongo/src/core/database/pongoDb.ts`
- **Package root**: `src/packages/pongo/`

### New Files (expected)

- `src/packages/pongo/src/core/cache/types.ts` — `PongoCacheProvider`, `CacheConfig`, event hooks
- `src/packages/pongo/src/core/cache/inMemoryProvider.ts` — `lru-cache` backed provider
- `src/packages/pongo/src/core/cache/cacheWrapper.ts` — key prefixing, error swallowing, hooks
- `src/packages/pongo/src/core/cache/configResolution.ts` — cascading config merge
- `src/packages/pongo/src/core/cache/index.ts` — barrel export
- Test files alongside each

---

## Step-by-Step Prompts

### Prompt 1: Cache types and provider interface

```text
We are adding a 2nd level document cache to Pongo. Start with the type definitions.

Create `src/packages/pongo/src/core/cache/types.ts` with:

1. `MaybePromise<T>` — `T | PromiseLike<T>`

2. `PongoCacheProvider` interface:
   - `get(key: string): MaybePromise<PongoDocument | null | undefined>`
   - `set(key: string, value: PongoDocument, options?: { ttl?: number }): MaybePromise<void>`
   - `delete(key: string): MaybePromise<void>`
   - `getMany(keys: string[]): MaybePromise<(PongoDocument | null | undefined)[]>`
   - `setMany(entries: { key: string; value: PongoDocument; ttl?: number }[]): MaybePromise<void>`
   - `deleteMany(keys: string[]): MaybePromise<void>`
   - `clear(): MaybePromise<void>`

3. `CacheEventHooks` type:
   - `onHit?(key: string): void`
   - `onMiss?(key: string): void`
   - `onEvict?(key: string): void`
   - `onError?(error: unknown, operation: string): void`

4. `CacheConfig` type:
   - An object with `type: string`, optional `max?: number`, `ttl?: number`, and `[key: string]: unknown` for type-specific options.
   - OR the literal `'disabled'`.
   - `undefined` means "inherit from parent".

5. `CacheOptions` type (for per-operation use):
   - `skipCache?: boolean`

Import `PongoDocument` from the existing typing module.

Create `src/packages/pongo/src/core/cache/index.ts` as a barrel export.

Write tests FIRST in `src/packages/pongo/src/core/cache/types.unit.spec.ts`:
- Verify `CacheConfig` type discriminates correctly (object vs 'disabled')
- Verify a mock object satisfying `PongoCacheProvider` compiles and works (call each method, assert return types)
- These are compile-time/type-level sanity tests plus runtime behavior of a simple mock provider

Use vitest. Follow existing test patterns in the project.
```

### Prompt 2: In-memory cache provider (lru-cache)

```text
Implement the in-memory cache provider backed by `lru-cache`.

First, add `lru-cache` as a dependency in `src/packages/pongo/package.json`.

Then write tests FIRST in `src/packages/pongo/src/core/cache/inMemoryProvider.unit.spec.ts`:
- `get` returns `undefined` for missing keys
- `set` then `get` returns the stored document
- `set` with TTL — document expires after TTL (use lru-cache's TTL support, test with a short TTL and a small delay)
- `delete` removes a cached entry
- `getMany` returns documents for found keys and `undefined` for missing
- `setMany` stores multiple documents, retrievable via `get`
- `deleteMany` removes multiple entries
- `clear` removes all entries
- Respects `max` — when cache is full, LRU entry is evicted
- Returns values synchronously (not wrapped in Promises)

Then implement `src/packages/pongo/src/core/cache/inMemoryProvider.ts`:
- Export a factory function `inMemoryCacheProvider(options?: { max?: number; ttl?: number }): PongoCacheProvider`
- Default `max: 1000`, no default TTL
- Use `lru-cache`'s `LRUCache` class
- Batch methods (`getMany`, `setMany`, `deleteMany`) loop internally over single ops

Export from `src/packages/pongo/src/core/cache/index.ts`.
```

### Prompt 3: Cache wrapper (key prefixing, error swallowing, hooks)

```text
Build the Pongo cache wrapper that sits between collection code and the raw provider.

Write tests FIRST in `src/packages/pongo/src/core/cache/cacheWrapper.unit.spec.ts`:

Key prefixing:
- `get('doc1')` on wrapper with dbName='mydb', collectionName='users' calls provider.get('mydb:users:doc1')
- Same pattern for `set`, `delete`, `getMany`, `setMany`, `deleteMany`

Error swallowing:
- If provider.get throws, wrapper returns `undefined` (treated as cache miss)
- If provider.set throws, wrapper silently succeeds (no error propagated)
- If provider.delete throws, wrapper silently succeeds
- Same for batch operations

Event hooks:
- `onHit` called when `get` returns a non-null/undefined value
- `onMiss` called when `get` returns null/undefined
- `onEvict` called on `delete`
- `onError` called when provider throws, receives the error and operation name

Then implement `src/packages/pongo/src/core/cache/cacheWrapper.ts`:
- Export `pongoCacheWrapper(options: { provider: PongoCacheProvider; dbName: string; collectionName: string; hooks?: CacheEventHooks; defaultTtl?: number }): PongoCacheProvider`
- Returns a `PongoCacheProvider` that prefixes keys, catches errors, and fires hooks
- `clear()` delegates directly to provider's `clear()`

Export from the barrel.
```

### Prompt 4: Cache config resolution (cascading)

```text
Implement the cascading cache configuration resolution.

Write tests FIRST in `src/packages/pongo/src/core/cache/configResolution.unit.spec.ts`:

Resolution rules:
- `undefined` at a level means inherit from parent
- `'disabled'` at any level means caching is off from that level down
- A `CacheConfig` object overrides parent
- General params (`max`, `ttl`) cascade: if child sets `type` but not `max`, inherit parent's `max`
- If child switches `type`, type-specific params (anything beyond `type`, `max`, `ttl`) reset to defaults (not inherited)
- `skipCache: true` at operation level always wins regardless of config

Test cases:
- No config at any level → returns default config (`{ type: 'in-memory', max: 1000 }`)
- Client sets `{ type: 'in-memory', max: 500 }`, collection is `undefined` → collection inherits `{ type: 'in-memory', max: 500 }`
- Client sets config, collection sets `'disabled'` → resolved is `'disabled'`
- Client sets `{ type: 'in-memory', max: 500, ttl: 60000 }`, collection sets `{ type: 'in-memory', max: 200 }` → resolved gets `max: 200, ttl: 60000`
- Parent has type-specific param `{ type: 'redis', host: 'localhost' }`, child switches to `{ type: 'in-memory' }` → child does NOT inherit `host`
- Full cascade: client → db → collection → session with various overrides
- `skipCache: true` check (simple boolean, tested at call site)

Then implement `src/packages/pongo/src/core/cache/configResolution.ts`:
- Export `resolveCacheConfig(...configs: (CacheConfig | 'disabled' | undefined)[]): CacheConfig | 'disabled'`
- Takes configs in priority order (most general first: client, db, collection, session)
- Returns the fully resolved config

Export from the barrel.
```

### Prompt 5: Add `skipCache` and `cache` to existing option types

```text
Extend the existing Pongo option types to support cache configuration.

First, read and understand the current types in `src/packages/pongo/src/core/typing/operations.ts`.

Add `skipCache?: boolean` to `CollectionOperationOptions`. This makes it available on all operations (findOne, find, insertOne, updateOne, deleteOne, handle, etc.) since they all extend or include `CollectionOperationOptions`.

Add cache config to the higher-level option types:
- Add `cache?: CacheConfig | 'disabled'` to `PongoClientOptions` (in operations.ts or wherever it's defined)
- Add `cache?: CacheConfig | 'disabled'` to `PongoDatabaseOptions` (in `pongoDb.ts`)
- Add `cache?: CacheConfig | 'disabled'` to `PongoCollectionOptions` (in `pongoCollection.ts`)
- Add `cache?: CacheConfig | 'disabled'` to `PongoSession` type or session options
- Add `cache?: CacheConfig | 'disabled' | PongoCacheProvider` to allow passing a provider instance directly

Write tests (type-level checks in a `.unit.spec.ts`):
- Verify `skipCache` is accepted on `CollectionOperationOptions`
- Verify `cache` is accepted on the various option types
- Verify existing code still compiles (no breaking changes)

Do NOT wire anything into pongoCollection yet — just the type changes.
```

### Prompt 6: Wire cache into `pongoCollection` — read path (findOne)

```text
Wire the cache into `pongoCollection` for the `findOne` read path.

Write tests FIRST in a new file `src/packages/pongo/src/core/cache/collectionCache.int.spec.ts` (integration test using a real in-memory cache + mock/simple SQL executor):

Test setup: create a `pongoCollection` with an in-memory cache provider.

Tests for `findOne`:
- `findOne({ _id: 'x' })` on cache miss → queries DB, populates cache, returns document
- `findOne({ _id: 'x' })` on cache hit → returns cached document without DB query
- `findOne({ _id: 'x' }, { skipCache: true })` → always queries DB
- `findOne` with non-`_id` filter → bypasses cache entirely, queries DB
- After a document is cached, a second `findOne` by `_id` returns the cached version

Implementation in `pongoCollection.ts`:
- Accept an optional `PongoCacheProvider` (already wrapped) in `PongoCollectionOptions`
- In `findOne`: if filter targets `_id` and cache is available and `skipCache` is not true, check cache first. On hit, return. On miss, query DB, populate cache, return.
- Extract a helper to detect if a filter is an `_id`-only filter

Keep changes minimal — only touch `findOne` for now.
```

### Prompt 7: Wire cache into `pongoCollection` — write paths

```text
Wire cache into `pongoCollection` for write operations.

Write tests FIRST, extending `collectionCache.int.spec.ts`:

Tests for `insertOne`:
- After `insertOne`, the document is in the cache (verify via direct cache `get`)
- `findOne({ _id })` after `insertOne` returns from cache (no DB hit)

Tests for `insertMany`:
- After `insertMany`, all documents are in the cache

Tests for `updateOne`:
- After `updateOne`, cache is updated with the new document state
- Previous cached version is replaced

Tests for `replaceOne`:
- After `replaceOne`, cache is updated

Tests for `deleteOne`:
- After `deleteOne`, document is evicted from cache
- `findOne({ _id })` after delete returns null (cache miss, DB returns nothing)

Tests for `deleteMany` (by ids):
- After `deleteMany` with `_id: { $in: [...] }` filter, those ids are evicted from cache
- `deleteMany` with non-id filter does NOT evict from cache

Implementation in `pongoCollection.ts`:
- `insertOne`: after successful insert, `cache.set(id, document)`
- `insertMany`: after successful insert, `cache.setMany(documents)`
- `updateOne` / `replaceOne`: after successful write, fetch the updated doc and cache it (or construct it from the write result if possible)
- `deleteOne`: after successful delete, `cache.delete(id)`
- `deleteMany`: if filter contains `_id` with `$in`, `cache.deleteMany(ids)`
```

### Prompt 8: Wire cache into `handle` method

```text
Wire cache into the `handle` method in `pongoCollection`.

Write tests FIRST, extending `collectionCache.int.spec.ts`:

Tests for `handle`:
- `handle(id, handler)` reads from cache on cache hit
- `handle(id, handler)` populates cache after DB read on cache miss
- After `handle` inserts a new document, it's in the cache
- After `handle` updates a document, cache is updated
- After `handle` deletes a document (handler returns null), cache is evicted
- `handle(id, handler, { skipCache: true })` bypasses cache for read
- `handle` with `expectedVersion` — if cached doc's `_version` doesn't match, return failure without hitting DB (cheap short-circuit)

Tests for concurrency error handling:
- When a write inside `handle` fails with a concurrency error, the stale cache entry is evicted

Implementation in `pongoCollection.ts`:
- `handle` already calls `findOne` internally — that path is already cached from Prompt 6
- After handle's write operations (insert/replace/delete), update/evict cache accordingly
- Add `expectedVersion` vs cached `_version` comparison for short-circuit
- On concurrency error (when `operationResult.successful === false`), evict from cache
```

### Prompt 9: Wire cache into `find` (batch) and `findOneAnd*` methods

```text
Wire cache into `find` (batch read) and `findOneAndDelete`/`findOneAndReplace`/`findOneAndUpdate`.

Write tests FIRST, extending `collectionCache.int.spec.ts`:

Tests for `find`:
- `find({ _id: { $in: [id1, id2, id3] } })` — returns cached docs for hits, queries DB for misses, populates cache with DB results
- `find` with non-`_id` filter bypasses cache
- `find` with `skipCache: true` bypasses cache

Tests for `findOneAndDelete`:
- After `findOneAndDelete`, document is evicted from cache

Tests for `findOneAndReplace`:
- After `findOneAndReplace`, cache is updated with the replacement

Tests for `findOneAndUpdate`:
- After `findOneAndUpdate`, cache is updated

Implementation:
- `find`: detect `_id: { $in: [...] }` pattern. Check cache for each id. Query DB for misses only. Merge results. Populate cache with DB results.
- `findOneAndDelete/Replace/Update`: these already call `findOne` + write ops internally, so cache behavior comes mostly for free. Verify and add any missing cache updates.
```

### Prompt 10: Cache + transaction integration

```text
Wire cache behavior for transactions.

Write tests FIRST in `src/packages/pongo/src/core/cache/transactionCache.int.spec.ts`:

Tests:
- Reads within a transaction use the cache (default behavior)
- Writes within a transaction do NOT update cache until commit
- After transaction commit, cache is updated with all write results
- After transaction rollback, cache is NOT updated
- `startSession({ cache: 'disabled' })` disables cache for that session
- Per-session cache config overrides collection config

Implementation:
- During a transaction, collect cache mutations (sets/deletes) in a buffer
- On commit, flush the buffer to the cache
- On rollback, discard the buffer
- Add `cache` option to session/transaction options
- Wire session-level cache config into the cascade resolution
```

### Prompt 11: Cascading config wiring (client → db → collection → session)

```text
Wire the full cascading cache config through the Pongo hierarchy.

Write tests FIRST in `src/packages/pongo/src/core/cache/cascadingConfig.int.spec.ts`:

Tests:
- Client-level cache config propagates to db and collection
- Db-level override takes precedence over client
- Collection-level override takes precedence over db
- Session-level override takes precedence over collection
- `'disabled'` at any level disables for that level and below
- Default (no config anywhere) → in-memory cache with max 1000

Implementation:
- In `pongoClient`: resolve cache config, pass to db factory
- In `PongoDatabase`: accept cache config, pass to collection factory
- In `pongoCollection`: accept cache config, create/reuse provider based on resolved config
- Provider instance reuse: if same config object reference or equivalent config, reuse the provider instance
- Add `inMemoryCacheProvider` as the default factory when `type: 'in-memory'`
```

### Prompt 12: End-to-end tests with PostgreSQL

```text
Write end-to-end tests for the cache with a real PostgreSQL database.

Create `src/packages/pongo/src/e2e/postgresql/pg/postgres.cache.e2e.spec.ts`.

Follow the existing pattern in `postgres.optimistic-concurrency.spec.ts` (testcontainers, pongoClient, etc.).

Tests:
- Basic cache flow: insertOne → findOne hits cache → updateOne → findOne returns updated from cache
- Cache eviction on delete: insertOne → deleteOne → findOne returns null
- Concurrency scenario: two clients, one updates a doc, the other reads stale from cache, tries to write, gets concurrency error, cache is evicted, retry succeeds
- `skipCache` works end-to-end: findOne with skipCache always hits DB
- Cache disabled at collection level: operations work normally without caching
- handle method with cache: insert via handle → read from cache → update via handle → cache updated

Keep tests focused on behavior, not implementation details.
```

### Prompt 13: updateMany cache integration and cleanup

```text
Handle the remaining edge cases and clean up.

Write tests:
- `updateMany` does NOT update cache (no way to know affected ids without extra query — same as filter-based deleteMany)
- Verify `updateMany` on cached documents doesn't leave stale entries — document that this is a known limitation
- Cache wrapper `clear()` works and clears all entries for the provider

Implementation:
- Ensure `updateMany` does NOT interact with cache (spec says filter-based operations don't cache)
- Add cache `clear()` to collection if needed for advanced use
- Review all collection methods one final time to ensure cache consistency
- Export all public cache types from the package's main index

Final integration check:
- Run full test suite to verify no regressions
- Verify TypeScript compilation
- Verify all new types are exported correctly
```

---

## Dependency Graph

```
Prompt 1 (types) → Prompt 2 (in-memory provider) → Prompt 3 (wrapper)
                                                         ↓
Prompt 4 (config resolution) → Prompt 5 (option types) → Prompt 6 (findOne)
                                                              ↓
                                                         Prompt 7 (writes)
                                                              ↓
                                                         Prompt 8 (handle)
                                                              ↓
                                                         Prompt 9 (find batch)
                                                              ↓
                                                    Prompt 10 (transactions)
                                                              ↓
                                                    Prompt 11 (cascading wiring)
                                                              ↓
                                                    Prompt 12 (e2e tests)
                                                              ↓
                                                    Prompt 13 (cleanup)
```

## Notes

- Each prompt is designed to be self-contained enough for a code-gen LLM to implement with TDD
- Prompts 1–4 build the cache infrastructure with no collection changes
- Prompts 5–9 wire cache into the collection incrementally
- Prompts 10–11 handle the harder integration (transactions, cascading)
- Prompts 12–13 are validation and polish
- `lru-cache` is the only new dependency
