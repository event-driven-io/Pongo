# Pongo 2nd Level Cache — Specification

## Overview

Add a document-level (by `_id`) 2nd level cache to Pongo with a pluggable provider interface. Ships with an in-memory provider backed by `lru-cache`. Enabled by default. Designed to be minimally invasive to existing code.

## Cache Interface

### `PongoCacheProvider<T>`

A thin, Pongo-owned interface. No coupling to any third-party API.

```typescript
type MaybePromise<T> = T | PromiseLike<T>;

interface PongoCacheProvider {
  get(key: string): MaybePromise<PongoDocument | null | undefined>;
  set(key: string, value: PongoDocument, options?: { ttl?: number }): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
  getMany(keys: string[]): MaybePromise<(PongoDocument | null | undefined)[]>;
  setMany(entries: { key: string; value: PongoDocument; ttl?: number }[]): MaybePromise<void>;
  deleteMany(keys: string[]): MaybePromise<void>;
  clear(): MaybePromise<void>;
}
```

- `MaybePromise` return types: sync providers (in-memory) return values directly, async providers (Redis) return Promises. `await` handles both transparently.
- Batch methods (`getMany`, `setMany`, `deleteMany`) are first-class. Default in-memory implementation may loop internally, but the interface allows optimized batch ops for external providers.
- `clear()` is internal/advanced — not exposed to typical users. When sharing a cache instance across collections, scoping is handled via key prefixing by Pongo, not by the provider.

### Cache key strategy

Pongo manages key prefixing internally: `{dbName}:{collectionName}:{documentId}`.

The cache provider works with plain string keys — namespacing is Pongo's concern, not the provider's.

### Event hooks

The Pongo cache wrapper supports basic callbacks:

- `onHit?(key: string): void`
- `onMiss?(key: string): void`
- `onEvict?(key: string): void`
- `onError?(error: unknown, operation: string): void`

These are optional and intended for debugging and future observability integration.

## Configuration

### `CacheConfig`

```typescript
type CacheConfig = {
  type: string;               // e.g., 'in-memory', 'redis', etc.
  max?: number;               // max entries (general param, cascades)
  ttl?: number;               // TTL in ms (general param, cascades)
  // type-specific options live here too, keyed by type
  [key: string]: unknown;
} | 'disabled';
```

Three states:
- `undefined` — inherit from parent level
- `'disabled'` — explicitly turn off caching at this level
- `CacheConfig` object — explicit configuration

### Cascading configuration

Cache config can be set at multiple levels. Each level inherits from its parent unless explicitly overridden:

**client → db → collection → session → per-operation**

Inheritance rules:
- General params (`max`, `ttl`) cascade down.
- If a lower level switches `type`, type-specific params reset to defaults (not inherited from parent).
- Session overrides collection — session is a logical grouping of operations, natural place to override runtime behavior (e.g., disable cache for a bulk import).
- Per-operation `skipCache?: boolean` is the most granular escape hatch.

### Passing a cache instance

Users can provide either:
- **Settings** — Pongo creates and manages the cache provider.
- **A pre-built cache provider instance** — Pongo uses it directly.

If settings are the same across multiple collections, Pongo can reuse the same provider instance internally. When a user passes an instance, multiple collections can explicitly share one cache.

### Defaults

- **Enabled by default**
- `max`: follow `lru-cache` recommended defaults (1000)
- `ttl`: follow `lru-cache` recommended defaults
- Default provider: in-memory (`lru-cache`)

## Integration points

### Where: `pongoCollection` factory function

Cache logic is added directly inside `pongoCollection`, not as an external decorator/wrapper. This gives cache operations access to internal state (filter inspection, `_version`, write outcomes) and keeps observability precise.

### Read operations

**`findOne`:**
- If the filter targets `_id`, check cache first.
- Cache hit → return cached document.
- Cache miss → query DB, populate cache, return.
- `skipCache?: boolean` option available.

**`findMany` / other query methods:**
- If the filter is a list of `_id` values, check cache for each.
- Return cached hits, query DB for misses, populate cache with DB results.
- Non-`_id` filters bypass cache entirely (cache is by-id only).

### Write operations

**`insertOne`:**
- After successful insert, put the document into cache.

**`insertMany`:**
- After successful insert, put all documents into cache.

**`updateOne` / `updateMany` / `replaceOne`:**
- After successful write, update the cache entry with the new document state.

**`deleteOne`:**
- After successful delete, evict from cache.

**`deleteMany`:**
- If deleting by ids, evict those ids from cache.
- Filter-based `deleteMany` does not evict (no way to know affected ids without extra query). Future improvement possible.

### Optimistic concurrency

- On concurrency error (version mismatch), **evict the stale entry** from cache. This is critical — a concurrency error means someone else updated the record (e.g., from another node), so the cached version is stale.
- If a caller provides `expectedVersion` and the cached document has `_version`, compare them in memory. If they don't match, we know it's stale without hitting the DB — cheap short-circuit.

### `handle` method

- Accepts `id: string | string[]` (overloaded: string returns single result, string[] returns array).
- Read phase uses cache by default.
- Write phase updates/evicts cache based on outcome.
- `skipCache?: boolean` available in handle options.
- For batch: loads all ids from cache, fetches misses from DB in one query, processes handler per document, batch writes to DB, updates cache after commit.

### Transactions

- **Writes update cache only after commit.** Not during the transaction — uncommitted data should not enter the cache.
- **Reads within a transaction check cache** by default (most transactions are short-lived, cached data is probably valid). If the transaction modified a document and then reads it, cache miss falls through to DB which returns the correct uncommitted state.
- Cache can be disabled per-session: `startSession({ cache: 'disabled' })`.
- Per-session cache settings follow the cascade (session overrides collection).

## Error handling

Cache provider errors are **swallowed** — treated as cache misses. The application never fails because of a cache failure.

- Cache is an optimization, not a correctness requirement.
- Errors trigger `onError` hook for debugging.
- Future: errors will become metrics and trace events when Pongo's observability layer lands.

## Future considerations (out of scope for v1)

- **Cache warming**: pluggable strategy for pre-populating cache on startup. Interface hook defined but no default implementation shipped.
- **Query-result caching**: caching results of non-`_id` queries. Complex invalidation — deferred.
- **Cross-node cache sharing**: Redis/Memcached providers. The interface supports it; no provider shipped in v1.
- **Filter-based `deleteMany` eviction**: would require querying affected ids before delete.
- **Observability integration**: metrics (hit ratio, latency saved, eviction counts), trace attributes, log entries for cache operations.

## Implementation approach

1. Define `PongoCacheProvider` interface and `CacheConfig` types.
2. Implement in-memory provider using `lru-cache`.
3. Build Pongo cache wrapper (key prefixing, event hooks, error swallowing).
4. Wire cascading config resolution (client → db → collection → session → per-op).
5. Integrate into `pongoCollection`: intercept `_id`-based reads, update cache on writes, evict on deletes and concurrency errors.
6. Extend `handle` to accept `string | string[]` with batch support.
7. Add `skipCache` to operation options.
8. Tests: unit tests for cache provider, integration tests for cache + collection operations, e2e tests for concurrency scenarios.
