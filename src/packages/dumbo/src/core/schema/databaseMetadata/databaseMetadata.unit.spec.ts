import assert from 'assert';
import { describe, it } from 'vitest';
import {
  DumboDatabaseMetadataRegistry,
  type DatabaseMetadata,
} from './databaseMetadata';

const stubMetadata = <
  SupportsMultipleDatabases extends boolean = boolean,
  SupportsSchemas extends boolean = boolean,
  SupportsFunctions extends boolean = boolean,
>(
  databaseType: string,
  overrides?: Partial<
    DatabaseMetadata<
      SupportsMultipleDatabases,
      SupportsSchemas,
      SupportsFunctions
    >
  >,
): DatabaseMetadata<
  SupportsMultipleDatabases,
  SupportsSchemas,
  SupportsFunctions
> =>
  ({
    databaseType,
    capabilities: {
      supportsSchemas: false,
      supportsFunctions: false,
      supportsMultipleDatabases: false,
    },
    tableExists: () => Promise.resolve(false),
    ...overrides,
  }) as unknown as DatabaseMetadata<
    SupportsMultipleDatabases,
    SupportsSchemas,
    SupportsFunctions
  >;

describe('DumboDatabaseMetadataRegistry', () => {
  describe('register and tryGet', () => {
    it('registers and retrieves metadata by database type', () => {
      const registry = DumboDatabaseMetadataRegistry();
      const metadata = stubMetadata('TestDB');

      registry.register('TestDB', metadata);

      const result = registry.tryGet('TestDB');
      assert.strictEqual(result, metadata);
    });

    it('returns null for unregistered database type', () => {
      const registry = DumboDatabaseMetadataRegistry();

      const result = registry.tryGet('NonExistent');
      assert.strictEqual(result, null);
    });

    it('does not overwrite already registered resolved metadata', () => {
      const registry = DumboDatabaseMetadataRegistry();
      const first = stubMetadata('TestDB', { defaultDatabaseName: 'first' });
      const second = stubMetadata('TestDB', { defaultDatabaseName: 'second' });

      registry.register('TestDB', first);
      registry.register('TestDB', second);

      const result = registry.tryGet('TestDB');
      assert.strictEqual(result?.defaultDatabaseName, 'first');
    });

    it('overwrites a lazy entry with a resolved one', () => {
      const registry = DumboDatabaseMetadataRegistry();
      const lazy = () =>
        Promise.resolve(
          stubMetadata('TestDB', { defaultDatabaseName: 'lazy' }),
        );
      const resolved = stubMetadata('TestDB', {
        defaultDatabaseName: 'resolved',
      });

      registry.register('TestDB', lazy);
      registry.register('TestDB', resolved);

      const result = registry.tryGet('TestDB');
      assert.strictEqual(result?.defaultDatabaseName, 'resolved');
    });
  });

  describe('tryResolve', () => {
    it('resolves a lazy metadata entry', async () => {
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

    it('returns null for unregistered type', async () => {
      const registry = DumboDatabaseMetadataRegistry();

      const result = await registry.tryResolve('Missing');
      assert.strictEqual(result, null);
    });

    it('returns already resolved metadata directly', async () => {
      const registry = DumboDatabaseMetadataRegistry();
      const metadata = stubMetadata('DirectDB');

      registry.register('DirectDB', metadata);

      const result = await registry.tryResolve('DirectDB');
      assert.strictEqual(result, metadata);
    });
  });

  describe('has', () => {
    it('returns true for registered type', () => {
      const registry = DumboDatabaseMetadataRegistry();
      registry.register('HasDB', stubMetadata('HasDB'));

      assert.strictEqual(registry.has('HasDB'), true);
    });

    it('returns false for unregistered type', () => {
      const registry = DumboDatabaseMetadataRegistry();

      assert.strictEqual(registry.has('NopeDB'), false);
    });

    it('returns true for lazy registered type', () => {
      const registry = DumboDatabaseMetadataRegistry();
      registry.register('LazyHas', () =>
        Promise.resolve(stubMetadata('LazyHas')),
      );

      assert.strictEqual(registry.has('LazyHas'), true);
    });
  });

  describe('databaseTypes', () => {
    it('returns all registered database types', () => {
      const registry = DumboDatabaseMetadataRegistry();
      registry.register('Alpha', stubMetadata('Alpha'));
      registry.register('Beta', stubMetadata('Beta'));

      const types = registry.databaseTypes;
      assert.deepStrictEqual(types.sort(), ['Alpha', 'Beta']);
    });

    it('returns empty array when nothing registered', () => {
      const registry = DumboDatabaseMetadataRegistry();

      assert.deepStrictEqual(registry.databaseTypes, []);
    });
  });
});
