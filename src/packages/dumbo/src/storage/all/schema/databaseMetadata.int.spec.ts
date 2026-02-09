import assert from 'assert';
import { describe, it } from 'node:test';
import { dumboDatabaseMetadataRegistry } from '../../../core';
import '../index';

void describe('dumboDatabaseMetadataRegistry - automatic registrations', () => {
  void describe('PostgreSQL metadata', () => {
    void it('is automatically registered', () => {
      assert.strictEqual(dumboDatabaseMetadataRegistry.has('PostgreSQL'), true);
    });

    void it('can be retrieved via tryGet', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata, 'PostgreSQL metadata should be registered');
      assert.strictEqual(metadata.databaseType, 'PostgreSQL');
      assert.strictEqual(metadata.defaultDatabaseName, 'postgres');
    });

    void it('has correct capabilities', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(metadata.capabilities.supportsSchemas, true);
      assert.strictEqual(metadata.capabilities.supportsFunctions, true);
    });

    void it('has tableExists function', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(typeof metadata.tableExists, 'function');
    });

    void it('has functionExists function', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(typeof metadata.functionExists, 'function');
    });

    void it('has parseDatabaseName function', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(typeof metadata.parseDatabaseName, 'function');
    });

    void it('returns correct default database name', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata);
      assert.strictEqual(metadata.defaultDatabaseName, 'postgres');
      assert.strictEqual(
        metadata.parseDatabaseName('postgresql://localhost/mydb'),
        'mydb',
      );
    });
  });

  void describe('SQLite metadata', () => {
    void it('is automatically registered', () => {
      assert.strictEqual(dumboDatabaseMetadataRegistry.has('SQLite'), true);
    });

    void it('can be retrieved via tryGet', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata, 'SQLite metadata should be registered');
      assert.strictEqual(metadata.databaseType, 'SQLite');
      assert.strictEqual(metadata.defaultDatabaseName, undefined);
    });

    void it('has correct capabilities', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata);
      assert.strictEqual(metadata.capabilities.supportsSchemas, false);
      assert.strictEqual(metadata.capabilities.supportsFunctions, false);
    });

    void it('has tableExists function', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata);
      assert.strictEqual(typeof metadata.tableExists, 'function');
    });

    void it('does not have functionExists', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata);
      assert.strictEqual(metadata.functionExists, undefined);
    });

    void it('returns correct default database name', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('SQLite');

      assert.ok(metadata);
      assert.strictEqual(metadata.defaultDatabaseName, undefined);
      assert.strictEqual(metadata.parseDatabaseName, undefined);
    });
  });

  void describe('registered database types', () => {
    void it('lists both PostgreSQL and SQLite', () => {
      const types = dumboDatabaseMetadataRegistry.databaseTypes;

      assert.ok(types.includes('PostgreSQL'), 'Should include PostgreSQL');
      assert.ok(types.includes('SQLite'), 'Should include SQLite');
    });
  });
});
