import assert from 'node:assert';
import { describe, it } from 'vitest';
import { pongoDriverRegistry } from './';

describe('Pongo Driver Registry', () => {
  describe('Fails to get existing drivers when they were NOT resolved already', () => {
    it('fails to get pg', () => {
      const resolved = pongoDriverRegistry.tryGet('PostgreSQL:pg');

      assert.equal(
        resolved,
        null,
        "Get shouldn't resolve PostgreSQL:pg driver before it was resolved",
      );
    });

    it('fails to get sqlite3', () => {
      const resolved = pongoDriverRegistry.tryGet('SQLite:sqlite3');

      assert.equal(
        resolved,
        null,
        "Get shouldn't resolve SQLite:sqlite3 driver before it was resolved",
      );
    });

    it('fails to get d1', () => {
      const resolved = pongoDriverRegistry.tryGet('SQLite:d1');

      assert.equal(
        resolved,
        null,
        "Get shouldn't resolve SQLite:d1 driver before it was resolved",
      );
    });
  });

  describe('Resolves existing drivers', () => {
    it('resolves pg', async () => {
      const resolved = await pongoDriverRegistry.tryResolve('PostgreSQL:pg');

      assert.ok(resolved, 'Failed to resolve PostgreSQL:pg driver');
    });

    it('resolves sqlite3', async () => {
      const resolved = await pongoDriverRegistry.tryResolve('SQLite:sqlite3');

      assert.ok(resolved, 'Failed to resolve SQLite:sqlite3 driver');
    });

    it('resolves d1', async () => {
      const resolved = await pongoDriverRegistry.tryResolve('SQLite:d1');

      assert.ok(resolved, 'Failed to resolve SQLite:d1 driver');
    });
  });

  describe('Gets existing drivers when they were resolved already', () => {
    it('gets pg', () => {
      const resolved = pongoDriverRegistry.tryGet('PostgreSQL:pg');

      assert.ok(resolved, 'Failed to get PostgreSQL:pg driver');
    });

    it('gets sqlite3', () => {
      const resolved = pongoDriverRegistry.tryGet('SQLite:sqlite3');

      assert.ok(resolved, 'Failed to get SQLite:sqlite3 driver');
    });

    it('gets d1', () => {
      const resolved = pongoDriverRegistry.tryGet('SQLite:d1');

      assert.ok(resolved, 'Failed to get SQLite:d1 driver');
    });
  });
});
