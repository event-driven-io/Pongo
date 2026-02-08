import assert from 'assert';
import { describe, it } from 'node:test';
import {
  dumboDatabaseDriverRegistry,
  dumboDatabaseMetadataRegistry,
} from '../../core';

// Side-effect imports that trigger automatic metadata + driver registration
import '../../storage/postgresql/pg';
import '../../storage/sqlite/sqlite3';
import '../../storage/sqlite/d1';

void describe('dumboDatabaseMetadataRegistry - automatic registrations', () => {
  void describe('PostgreSQL metadata', () => {
    void it('is automatically registered', () => {
      assert.strictEqual(dumboDatabaseMetadataRegistry.has('PostgreSQL'), true);
    });

    void it('can be retrieved via tryGet', () => {
      const metadata = dumboDatabaseMetadataRegistry.tryGet('PostgreSQL');

      assert.ok(metadata, 'PostgreSQL metadata should be registered');
      assert.strictEqual(metadata.databaseType, 'PostgreSQL');
      assert.strictEqual(metadata.defaultDatabase, 'postgres');
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
      assert.strictEqual(metadata.getDatabaseNameOrDefault(), 'postgres');
      assert.strictEqual(
        metadata.getDatabaseNameOrDefault('postgresql://localhost/mydb'),
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
      assert.strictEqual(metadata.defaultDatabase, ':memory:');
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
      assert.strictEqual(metadata.getDatabaseNameOrDefault(), ':memory:');
      assert.strictEqual(
        metadata.getDatabaseNameOrDefault('/path/to/db.sqlite'),
        '/path/to/db.sqlite',
      );
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

void describe('dumboDatabaseDriverRegistry - automatic registrations', () => {
  void describe('PostgreSQL:pg driver', () => {
    void it('is automatically registered', () => {
      assert.strictEqual(
        dumboDatabaseDriverRegistry.has('PostgreSQL:pg'),
        true,
      );
    });

    void it('has PostgreSQL metadata on the driver', () => {
      const driver = dumboDatabaseDriverRegistry.tryGet({
        driverType: 'PostgreSQL:pg',
      });

      assert.ok(driver, 'pg driver should be registered');
      assert.strictEqual(driver.databaseMetadata.databaseType, 'PostgreSQL');
      assert.strictEqual(driver.databaseMetadata.defaultDatabase, 'postgres');
    });
  });

  void describe('SQLite:sqlite3 driver', () => {
    void it('is automatically registered', () => {
      assert.strictEqual(
        dumboDatabaseDriverRegistry.has('SQLite:sqlite3'),
        true,
      );
    });

    void it('has SQLite metadata on the driver', () => {
      const driver = dumboDatabaseDriverRegistry.tryGet({
        driverType: 'SQLite:sqlite3',
      });

      assert.ok(driver, 'sqlite3 driver should be registered');
      assert.strictEqual(driver.databaseMetadata.databaseType, 'SQLite');
      assert.strictEqual(driver.databaseMetadata.defaultDatabase, ':memory:');
    });
  });

  void describe('SQLite:d1 driver', () => {
    void it('is automatically registered', () => {
      assert.strictEqual(dumboDatabaseDriverRegistry.has('SQLite:d1'), true);
    });

    void it('has SQLite-based metadata with d1 defaults', () => {
      const driver = dumboDatabaseDriverRegistry.tryGet({
        driverType: 'SQLite:d1',
      });

      assert.ok(driver, 'd1 driver should be registered');
      assert.strictEqual(driver.databaseMetadata.databaseType, 'SQLite');
      assert.strictEqual(
        driver.databaseMetadata.defaultDatabase,
        'd1:default',
      );
    });

    void it('has SQLite capabilities', () => {
      const driver = dumboDatabaseDriverRegistry.tryGet({
        driverType: 'SQLite:d1',
      });

      assert.ok(driver);
      assert.strictEqual(
        driver.databaseMetadata.capabilities.supportsSchemas,
        false,
      );
      assert.strictEqual(
        driver.databaseMetadata.capabilities.supportsFunctions,
        false,
      );
    });
  });

  void describe('registered driver types', () => {
    void it('includes all three drivers', () => {
      const types = dumboDatabaseDriverRegistry.databaseDriverTypes;

      assert.ok(
        types.includes('PostgreSQL:pg'),
        'Should include PostgreSQL:pg',
      );
      assert.ok(
        types.includes('SQLite:sqlite3'),
        'Should include SQLite:sqlite3',
      );
      assert.ok(types.includes('SQLite:d1'), 'Should include SQLite:d1');
    });
  });
});
