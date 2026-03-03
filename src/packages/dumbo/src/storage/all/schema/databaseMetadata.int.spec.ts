import assert from 'assert';
import { describe, it } from 'vitest';
import { dumboDatabaseMetadataRegistry } from '../../../core';
import '../index';

describe('dumboDatabaseMetadataRegistry - automatic registrations', () => {
  describe('PostgreSQL metadata', () => {
    it('is automatically registered', () => {
      assert.strictEqual(dumboDatabaseMetadataRegistry.has('PostgreSQL'), true);
    });

    it('can be retrieved via tryGet', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata, 'PostgreSQL metadata should be registered');
      assert.strictEqual(metadata.databaseType, 'PostgreSQL');
      assert.strictEqual(metadata.defaultDatabaseName, 'postgres');
    });

    it('has correct capabilities', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(metadata.capabilities.supportsSchemas, true);
      assert.strictEqual(metadata.capabilities.supportsFunctions, true);
    });

    it('has tableExists function', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(typeof metadata.tableExists, 'function');
    });

    it('has functionExists function', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(typeof metadata.functionExists, 'function');
    });

    it('has parseDatabaseName function', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(typeof metadata.parseDatabaseName, 'function');
    });

    it('returns correct default database name', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(metadata.defaultDatabaseName, 'postgres');
      assert.strictEqual(
        metadata.parseDatabaseName('postgresql://localhost/mydb'),
        'mydb',
      );
    });
  });

  describe('SQLite metadata', () => {
    it('is automatically registered', () => {
      assert.strictEqual(dumboDatabaseMetadataRegistry.has('SQLite'), true);
    });

    it('can be retrieved via tryGet', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata, 'SQLite metadata should be registered');
      assert.strictEqual(metadata.databaseType, 'SQLite');
      assert.strictEqual(metadata.defaultDatabaseName, undefined);
    });

    it('has correct capabilities', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata);
      assert.strictEqual(metadata.capabilities.supportsSchemas, false);
      assert.strictEqual(metadata.capabilities.supportsFunctions, false);
    });

    it('has tableExists function', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata);
      assert.strictEqual(typeof metadata.tableExists, 'function');
    });

    it('does not have functionExists', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata);
      assert.strictEqual(metadata.functionExists, undefined);
    });

    it('returns correct default database name', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata);
      assert.strictEqual(metadata.defaultDatabaseName, undefined);
      assert.strictEqual(metadata.parseDatabaseName, undefined);
    });
  });

  describe('registered database types', () => {
    it('lists both PostgreSQL and SQLite', () => {
      const types = dumboDatabaseMetadataRegistry.databaseTypes;

      assert.ok(types.includes('PostgreSQL'), 'Should include PostgreSQL');
      assert.ok(types.includes('SQLite'), 'Should include SQLite');
    });
  });
});
