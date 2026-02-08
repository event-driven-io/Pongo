import assert from 'assert';
import { describe, it } from 'node:test';
import {
  DumboDatabaseMetadataRegistry,
  type DatabaseMetadata,
} from './databaseMetadata';

const stubMetadata = (
  databaseType: string,
  overrides?: Partial<DatabaseMetadata>,
): DatabaseMetadata => ({
  databaseType,
  defaultDatabase: 'test_db',
  capabilities: { supportsSchemas: false, supportsFunctions: false },
  tableExists: () => Promise.resolve(false),
  getDatabaseNameOrDefault: () => 'test_db',
  ...overrides,
});

void describe('DumboDatabaseMetadataRegistry', () => {
  void describe('register and tryGet', () => {
    void it('registers and retrieves metadata by database type', () => {
      const registry = DumboDatabaseMetadataRegistry();
      const metadata = stubMetadata('TestDB');

      registry.register('TestDB', metadata);

      const result = registry.tryGet('TestDB');
      assert.strictEqual(result, metadata);
    });

    void it('returns null for unregistered database type', () => {
      const registry = DumboDatabaseMetadataRegistry();

      const result = registry.tryGet('NonExistent');
      assert.strictEqual(result, null);
    });

    void it('does not overwrite already registered resolved metadata', () => {
      const registry = DumboDatabaseMetadataRegistry();
      const first = stubMetadata('TestDB', { defaultDatabase: 'first' });
      const second = stubMetadata('TestDB', { defaultDatabase: 'second' });

      registry.register('TestDB', first);
      registry.register('TestDB', second);

      const result = registry.tryGet('TestDB');
      assert.strictEqual(result?.defaultDatabase, 'first');
    });

    void it('overwrites a lazy entry with a resolved one', () => {
      const registry = DumboDatabaseMetadataRegistry();
      const lazy = () =>
        Promise.resolve(stubMetadata('TestDB', { defaultDatabase: 'lazy' }));
      const resolved = stubMetadata('TestDB', { defaultDatabase: 'resolved' });

      registry.register('TestDB', lazy);
      registry.register('TestDB', resolved);

      const result = registry.tryGet('TestDB');
      assert.strictEqual(result?.defaultDatabase, 'resolved');
    });
  });

  void describe('tryResolve', () => {
    void it('resolves a lazy metadata entry', async () => {
      const registry = DumboDatabaseMetadataRegistry();
      const metadata = stubMetadata('LazyDB');
      const lazy = () => Promise.resolve(metadata);

      registry.register('LazyDB', lazy);

      // tryGet should return null for unresolved lazy entry
      assert.strictEqual(registry.tryGet('LazyDB'), null);

      const resolved = await registry.tryResolve('LazyDB');
      assert.strictEqual(resolved, metadata);

      // After resolving, tryGet should return the metadata
      assert.strictEqual(registry.tryGet('LazyDB'), metadata);
    });

    void it('returns null for unregistered type', async () => {
      const registry = DumboDatabaseMetadataRegistry();

      const result = await registry.tryResolve('Missing');
      assert.strictEqual(result, null);
    });

    void it('returns already resolved metadata directly', async () => {
      const registry = DumboDatabaseMetadataRegistry();
      const metadata = stubMetadata('DirectDB');

      registry.register('DirectDB', metadata);

      const result = await registry.tryResolve('DirectDB');
      assert.strictEqual(result, metadata);
    });
  });

  void describe('has', () => {
    void it('returns true for registered type', () => {
      const registry = DumboDatabaseMetadataRegistry();
      registry.register('HasDB', stubMetadata('HasDB'));

      assert.strictEqual(registry.has('HasDB'), true);
    });

    void it('returns false for unregistered type', () => {
      const registry = DumboDatabaseMetadataRegistry();

      assert.strictEqual(registry.has('NopeDB'), false);
    });

    void it('returns true for lazy registered type', () => {
      const registry = DumboDatabaseMetadataRegistry();
      registry.register('LazyHas', () =>
        Promise.resolve(stubMetadata('LazyHas')),
      );

      assert.strictEqual(registry.has('LazyHas'), true);
    });
  });

  void describe('databaseTypes', () => {
    void it('returns all registered database types', () => {
      const registry = DumboDatabaseMetadataRegistry();
      registry.register('Alpha', stubMetadata('Alpha'));
      registry.register('Beta', stubMetadata('Beta'));

      const types = registry.databaseTypes;
      assert.deepStrictEqual(types.sort(), ['Alpha', 'Beta']);
    });

    void it('returns empty array when nothing registered', () => {
      const registry = DumboDatabaseMetadataRegistry();

      assert.deepStrictEqual(registry.databaseTypes, []);
    });
  });
});
