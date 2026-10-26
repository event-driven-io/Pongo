import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bareImports,
  type Bundler,
  bundleConsumer,
  bundledPackageSources,
  bundledSources,
  externalImports,
  isInside,
  type ModuleFormat,
  nodeBuiltInImports,
  type PackageName,
  reachableFiles,
  runNodeConsumer,
  typeCheckConsumer,
} from './bundleTestSupport';

type PackageJson = {
  name: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const moduleFormats: ModuleFormat[] = ['cjs', 'js'];
const bundlers: Bundler[] = ['esbuild', 'rolldown'];
const nodeOnlyEntries = ['dumbo/sqlite3', 'pongo/cli'];
const executableEntries = ['pongo/cli'];
const bundledTypeDependencies: Record<string, string[]> = {
  'pongo-shims': ['mongodb', 'bson'],
};
const driverRegistrations = [
  'registerFormatter',
  'registerDefaultMigratorOptions',
  'dumboDatabaseMetadataRegistry.register',
  'pongoDriverRegistry.register',
  'usePgDumboDriver',
  'useSqlite3DumboDriver',
  'useD1DumboDriver',
  'useCloudflareDurableObjectSQLiteDumboDriver',
  'usePgPongoDriver',
  'useSqlite3PongoDriver',
  'useD1PongoDriver',
  'useCloudflareDurableObjectSQLitePongoDriver',
];

describe.each(bundleBoundaryScenarios())(
  '$packageName/$entry bundle',
  ({ packageName, entry, allowedSource, forbiddenImports, otherEntries }) => {
    const distDirectory = path.resolve(`packages/${packageName}/dist`);

    it.each(moduleFormats)(
      'does not include another public entry in its %s graph',
      (format) => {
        // Given
        const otherEntryFiles = otherEntries.map(
          (otherEntry) => `${otherEntry}.${format}`,
        );

        // When
        const files = reachableFiles(distDirectory, entry, format);

        // Then
        expect(
          [...files].filter((file) => otherEntryFiles.includes(file)),
          `${packageName}/${entry}.${format} reaches another public entry`,
        ).toEqual([]);
      },
    );

    it.each(moduleFormats)(
      "does not import another driver's optional dependency in its %s graph",
      (format) => {
        // Given
        const files = reachableFiles(distDirectory, entry, format);

        // When
        const unexpectedImports = [...files].flatMap((file) =>
          externalImports(distDirectory, file, format)
            .filter((dependency) => forbiddenImports.includes(dependency))
            .map((dependency) => `${file}: ${dependency}`),
        );

        // Then
        expect(
          unexpectedImports,
          `${packageName}/${entry}.${format} imports an optional dependency from another entry`,
        ).toEqual([]);
      },
    );

    it.each(moduleFormats)(
      'contains only its allowed package sources in its %s graph',
      (format) => {
        // Given
        const sources = bundledPackageSources(
          packageName,
          distDirectory,
          entry,
          format,
        );

        // When
        const unexpectedSources = sources
          .filter(({ packageSource }) => !allowedSource.test(packageSource))
          .map(
            ({ bundleFile, packageSource }) =>
              `${bundleFile}: ${packageSource}`,
          );

        // Then
        expect(
          unexpectedSources,
          `${packageName}/${entry}.${format} crosses a source boundary`,
        ).toEqual([]);
      },
    );
  },
);

describe.each(
  bundleBoundaryScenarios().filter(
    ({ packageName, entry }) =>
      !nodeOnlyEntries.includes(`${packageName}/${entry}`),
  ),
)('$packageName/$entry runtime-agnostic bundle', ({ packageName, entry }) => {
  const distDirectory = path.resolve(`packages/${packageName}/dist`);

  it.each(moduleFormats)(
    'does not import Node.js built-ins in its %s graph',
    (format) => {
      // Given
      const files = reachableFiles(distDirectory, entry, format);

      // When
      const builtInImports = [...files].flatMap((file) =>
        nodeBuiltInImports(distDirectory, file, format).map(
          (dependency) => `${file}: ${dependency}`,
        ),
      );

      // Then
      expect(
        builtInImports,
        `${packageName}/${entry}.${format} imports a Node.js built-in`,
      ).toEqual([]);
    },
  );
});

describe.each(
  bundleBoundaryScenarios().filter(
    ({ packageName, entry }) =>
      !executableEntries.includes(`${packageName}/${entry}`),
  ),
)('$packageName/$entry imported for side effects', ({ packageName, entry }) => {
  const distEntry = path.resolve(`packages/${packageName}/dist/${entry}.js`);

  it.each(bundlers)(
    'keeps nothing but driver registrations when bundled with %s',
    async (bundler) => {
      // Given
      const files = {
        'entry.js': withPureDriverRegistrations(
          fs.readFileSync(distEntry, 'utf8'),
        ),
        'consumer.js': `import './entry.js';\n`,
      };

      // When
      const bundled = await bundleConsumer(bundler, files);

      // Then
      expect(
        withoutImportsAndComments(bundled),
        `${packageName}/${entry} keeps code other than driver registrations when bundled with ${bundler}`,
      ).toBe('');
    },
  );

  it.each(bundlers)(
    'runs its driver registrations when bundled with %s',
    async (bundler) => {
      // Given
      const files = {
        'consumer.js': `import ${JSON.stringify(distEntry)};\n`,
      };
      const bundled = await bundleConsumer(bundler, files);

      // When
      const result = runNodeConsumer(
        'js',
        bundled,
        path.resolve('node_modules/.cache'),
      );

      // Then
      expect(result.status, result.stderr).toBe(0);
    },
  );

  it.each(moduleFormats)(
    'does not generate random values or UUIDs while importing its %s entry',
    (format) => {
      // Given
      const consumer = randomValuesConsumer(packageName, entry, format);

      // When
      const result = runNodeConsumer(format, consumer);

      // Then
      expect(result.status, result.stderr).toBe(0);
    },
  );
});

describe.each(publishedPackages())(
  '$packageName published files',
  ({ packageName, declaredDependencies, bundledDependencies }) => {
    const packageDirectory = path.resolve(`packages/${packageName}`);
    const distDirectory = path.join(packageDirectory, 'dist');

    it('import only declared dependencies', () => {
      // Given
      const files = fs.readdirSync(distDirectory).filter(isModuleFile);

      // When
      const undeclaredImports = files.flatMap((file) =>
        bareImports(path.join(distDirectory, file))
          .filter((dependency) => !declaredDependencies.has(dependency))
          .map((dependency) => `${file}: ${dependency}`),
      );

      // Then
      expect(
        undeclaredImports,
        `${packageName} dist imports undeclared packages`,
      ).toEqual([]);
    });

    it('do not include code of other packages', () => {
      // Given
      const sourceDirectory = path.join(packageDirectory, 'src');

      // When
      const foreignSources = bundledSources(distDirectory)
        .filter((source) => !isInside(sourceDirectory, source))
        .map((source) => path.relative(packageDirectory, source));

      // Then
      expect(
        foreignSources,
        `${packageName} dist includes code of other packages`,
      ).toEqual([]);
    });

    it('are built from sources importing only declared dependencies', () => {
      // Given
      const sources = bundledSources(distDirectory).filter(
        (source) => source.endsWith('.ts') && fs.existsSync(source),
      );

      // When
      const undeclaredImports = sources.flatMap((source) =>
        bareImports(source)
          .filter(
            (dependency) =>
              !declaredDependencies.has(dependency) &&
              !bundledDependencies.includes(dependency),
          )
          .map(
            (dependency) =>
              `${path.relative(packageDirectory, source)}: ${dependency}`,
          ),
      );

      // Then
      expect(
        undeclaredImports,
        `${packageName} sources import undeclared packages`,
      ).toEqual([]);
    });
  },
);

describe.each<PackageName>(['pongo', 'dumbo'])(
  '%s package types',
  (packageName) => {
    it.each(moduleFormats)(
      'accepts every driver entry as the root driver type in %s declarations',
      (format) => {
        // Given
        const consumer = driverTypeConsumer(packageName, format);

        // When
        const diagnostics = typeCheckConsumer(packageName, consumer);

        // Then
        expect(diagnostics).toEqual([]);
      },
    );
  },
);

describe('pongo package runtime compatibility', () => {
  it.each(pongoRuntimeScenarios())(
    'resolves a root-declared collection through the $driver $moduleSystem driver entry',
    (scenario) => {
      // Given
      const consumer = pongoCollectionConsumer(scenario);

      // When
      const result = runNodeConsumer(scenario.format, consumer);

      // Then
      expect(result.status, result.stderr).toBe(0);
    },
  );

  it.each(pongoDriverLoadingScenarios())(
    'loads the $driverType driver from the root entry in $moduleSystem',
    (scenario) => {
      // Given
      const consumer = pongoDriverLoadingConsumer(scenario);

      // When
      const result = runNodeConsumer(scenario.format, consumer);

      // Then
      expect(result.status, result.stderr).toBe(0);
    },
  );
});

describe('dumbo package error compatibility', () => {
  it.each(dumboErrorScenarios())(
    'recognises an InvalidOperationError from the $driver $moduleSystem entry',
    (scenario) => {
      // Given
      const consumer = dumboErrorConsumer(scenario);

      // When
      const result = runNodeConsumer(scenario.format, consumer);

      // Then
      expect(result.status, result.stderr).toBe(0);
    },
  );
});

function bundleBoundaryScenarios() {
  const allowedSources = {
    dumbo: {
      index:
        /^(?:core\/|storage\/all\/|storage\/postgresql\/core\/(?:connections\/connectionString|schema\/(?:schema|postgreSQLMetadata))\.ts$|storage\/sqlite\/core\/schema\/(?:schema|sqliteMetadata|sqlitePhysicalNames)\.ts$|index\.ts$)/,
      postgresql: /^(?:core\/|storage\/postgresql\/core\/|postgresql\.ts$)/,
      pg: /^(?:core\/|storage\/postgresql\/|pg\.ts$)/,
      sqlite: /^(?:core\/|storage\/sqlite\/core\/|sqlite\.ts$)/,
      sqlite3: /^(?:core\/|storage\/sqlite\/(?:core|sqlite3)\/|sqlite3\.ts$)/,
      cloudflare:
        /^(?:core\/|storage\/sqlite\/(?:core|d1|durableObject)\/|cloudflare\.ts$)/,
    },
    pongo: {
      index: /^(?:core\/|index\.ts$)/,
      shim: /^(?:core\/|mongo\/|shim\.ts$)/,
      cli: /^(?:core\/|commandLine\/|cli\.ts$)/,
      pg: /^(?:core\/|storage\/postgresql\/|pg\.ts$)/,
      sqlite3: /^(?:core\/|storage\/sqlite\/(?:core|sqlite3)\/|sqlite3\.ts$)/,
      cloudflare:
        /^(?:core\/|storage\/sqlite\/(?:core|d1|durableObject)\/|cloudflare\.ts$)/,
    },
  } as const;
  const forbiddenImports: Record<PackageName, Record<string, string[]>> = {
    dumbo: {
      index: ['pg', 'sqlite3'],
      postgresql: ['sqlite3'],
      pg: ['sqlite3'],
      sqlite: ['pg', 'sqlite3'],
      sqlite3: ['pg'],
      cloudflare: ['pg', 'sqlite3'],
    },
    pongo: {
      index: ['pg', 'sqlite3', 'ansis', 'cli-table3', 'commander'],
      shim: ['pg', 'sqlite3', 'ansis', 'cli-table3', 'commander'],
      cli: ['pg', 'sqlite3'],
      pg: ['sqlite3', 'ansis', 'cli-table3', 'commander'],
      sqlite3: ['pg', 'ansis', 'cli-table3', 'commander'],
      cloudflare: ['pg', 'sqlite3', 'ansis', 'cli-table3', 'commander'],
    },
  };

  return Object.entries(allowedSources).flatMap(([packageName, entries]) => {
    const entryNames = Object.keys(entries);

    return Object.entries(entries).map(([entry, allowedSource]) => ({
      packageName: packageName as PackageName,
      entry,
      allowedSource,
      forbiddenImports: forbiddenImports[packageName as PackageName][entry],
      otherEntries: entryNames.filter((otherEntry) => otherEntry !== entry),
    }));
  });
}

function driverTypeConsumer(
  packageName: PackageName,
  format: ModuleFormat,
): (packageImport: string) => string {
  return (packageImport) =>
    packageName === 'pongo'
      ? `
        import type { AnyPongoDriver as Driver } from '${packageImport}/index.${format}';
        import { pongoDriver as pg } from '${packageImport}/pg.${format}';
        import { pongoDriver as sqlite3 } from '${packageImport}/sqlite3.${format}';
        import { cloudflareDurableObjectSQLiteDriver as durableObject, pongoDriver as d1 } from '${packageImport}/cloudflare.${format}';

        const drivers: Driver[] = [pg, sqlite3, d1, durableObject];
        void drivers;
      `
      : `
        import type { AnyDumboDatabaseDriver as Driver } from '${packageImport}/index.${format}';
        import { pgDumboDriver as pg } from '${packageImport}/pg.${format}';
        import { sqlite3DumboDriver as sqlite3 } from '${packageImport}/sqlite3.${format}';
        import { cloudflareDurableObjectSQLiteDumboDriver as durableObject, d1DumboDriver as d1 } from '${packageImport}/cloudflare.${format}';

        const drivers: Driver[] = [pg, sqlite3, d1, durableObject];
        void drivers;
      `;
}

function pongoRuntimeScenarios() {
  const drivers = [
    {
      driver: 'PostgreSQL',
      driverEntry: 'pg',
      options: {
        connectionString:
          'postgresql://postgres:postgres@localhost:5432/postgres',
      },
    },
    {
      driver: 'SQLite3',
      driverEntry: 'sqlite3',
      options: { connectionString: ':memory:' },
    },
    { driver: 'D1', driverEntry: 'cloudflare', options: { database: {} } },
  ] as const;

  return drivers.flatMap((driver) =>
    moduleFormats.map((format) => ({
      ...driver,
      format,
      moduleSystem: format === 'js' ? 'ESM' : 'CommonJS',
    })),
  );
}

function dumboErrorScenarios() {
  const drivers = [
    {
      driver: 'PostgreSQL',
      driverEntry: 'pg',
      mapper: 'mapPostgresError',
      databaseError:
        "Object.assign(new Error('syntax error'), { code: '42601' })",
    },
    {
      driver: 'SQLite3',
      driverEntry: 'sqlite3',
      mapper: 'mapSqliteError',
      databaseError:
        "Object.assign(new Error('syntax error'), { code: 'SQLITE_ERROR' })",
    },
    {
      driver: 'D1',
      driverEntry: 'cloudflare',
      mapper: 'mapD1Error',
      databaseError: "new Error('D1_ERROR: syntax error')",
    },
  ] as const;

  return drivers.flatMap((driver) =>
    moduleFormats.map((format) => ({
      ...driver,
      format,
      moduleSystem: format === 'js' ? 'ESM' : 'CommonJS',
    })),
  );
}

function pongoDriverLoadingScenarios() {
  const driverTypes = [
    'PostgreSQL:pg',
    'SQLite:sqlite3',
    'SQLite:d1',
    'SQLite:cloudflareDurableObjectSQLite',
  ] as const;

  return driverTypes.flatMap((driverType) =>
    moduleFormats.map((format) => ({
      driverType,
      format,
      moduleSystem: format === 'js' ? 'ESM' : 'CommonJS',
    })),
  );
}

function pongoDriverLoadingConsumer(
  scenario: ReturnType<typeof pongoDriverLoadingScenarios>[number],
): string {
  const rootEntry = path.resolve(
    `packages/pongo/dist/index.${scenario.format}`,
  );
  const load =
    scenario.format === 'js'
      ? `const pongo = await import(${JSON.stringify(pathToFileURL(rootEntry).href)});`
      : `const pongo = require(${JSON.stringify(rootEntry)});`;

  return `
    const run = async () => {
      ${load}
      const driver = await pongo.pongoDriverRegistry.tryResolve(${JSON.stringify(scenario.driverType)});

      if (!driver) {
        throw new Error('The root entry did not load ${scenario.driverType}');
      }
    };

    run().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;
}

function pongoCollectionConsumer(
  scenario: ReturnType<typeof pongoRuntimeScenarios>[number],
): string {
  const pongoDist = path.resolve('packages/pongo/dist');
  const rootEntry = path.join(pongoDist, `index.${scenario.format}`);
  const driverEntry = path.join(
    pongoDist,
    `${scenario.driverEntry}.${scenario.format}`,
  );
  const imports =
    scenario.format === 'js'
      ? `
        import * as pongo from ${JSON.stringify(pathToFileURL(rootEntry).href)};
        import * as driver from ${JSON.stringify(pathToFileURL(driverEntry).href)};
      `
      : `
        const pongo = require(${JSON.stringify(rootEntry)});
        const driver = require(${JSON.stringify(driverEntry)});
      `;

  return `${imports}
    const shoppingCarts = pongo.pongoSchema.collection('shoppingCarts');
    const schema = pongo.pongoSchema.client({
      database: pongo.pongoSchema.db({ collections: { shoppingCarts } }),
    });
    const client = pongo.pongoClient({
      driver: driver.pongoDriver,
      ...${JSON.stringify(scenario.options)},
      schema: { definition: schema, autoMigration: 'None' },
    });

    const collection = client.database.collection('shoppingCarts');
    if (collection.collectionName !== 'shoppingCarts') {
      throw new Error('The declared collection was not resolved');
    }
  `;
}

function dumboErrorConsumer(
  scenario: ReturnType<typeof dumboErrorScenarios>[number],
): string {
  const dumboDist = path.resolve('packages/dumbo/dist');
  const rootEntry = path.join(dumboDist, `index.${scenario.format}`);
  const driverEntry = path.join(
    dumboDist,
    `${scenario.driverEntry}.${scenario.format}`,
  );
  const imports =
    scenario.format === 'js'
      ? `
        import * as dumbo from ${JSON.stringify(pathToFileURL(rootEntry).href)};
        import * as driver from ${JSON.stringify(pathToFileURL(driverEntry).href)};
      `
      : `
        const dumbo = require(${JSON.stringify(rootEntry)});
        const driver = require(${JSON.stringify(driverEntry)});
      `;

  return `${imports}
    const error = driver.${scenario.mapper}(${scenario.databaseError});
    const recognised = dumbo.DumboError.isInstanceOf(error, {
      errorType: dumbo.InvalidOperationError.ErrorType,
    });

    if (!recognised) {
      throw new Error('The driver error was not recognised by the root entry');
    }
  `;
}

function publishedPackages() {
  return fs
    .readdirSync('packages')
    .map((packageName) => ({
      packageName,
      packageJson: JSON.parse(
        fs.readFileSync(`packages/${packageName}/package.json`, 'utf8'),
      ) as PackageJson,
    }))
    .filter(({ packageJson }) => !packageJson.private)
    .map(({ packageName, packageJson }) => ({
      packageName,
      declaredDependencies: new Set([
        packageJson.name,
        ...Object.keys(packageJson.dependencies ?? {}),
        ...Object.keys(packageJson.peerDependencies ?? {}),
        ...Object.keys(packageJson.optionalDependencies ?? {}),
      ]),
      bundledDependencies: bundledTypeDependencies[packageName] ?? [],
    }));
}

function isModuleFile(file: string): boolean {
  return /\.(?:c?js|d\.c?ts)$/.test(file);
}

function withPureDriverRegistrations(source: string): string {
  const registrationCall = new RegExp(
    `^(?=(?:${driverRegistrations.map((name) => name.replaceAll('.', '\\.')).join('|')})\\()`,
    'gm',
  );

  return source.replace(registrationCall, '/* @__PURE__ */ ');
}

function withoutImportsAndComments(bundled: string): string {
  return bundled
    .split('\n')
    .filter((line) => !/^(?:import\s|\/\/)/.test(line))
    .join('\n')
    .trim();
}

function randomValuesConsumer(
  packageName: PackageName,
  entry: string,
  format: ModuleFormat,
): string {
  const distEntry = path.resolve(
    `packages/${packageName}/dist/${entry}.${format}`,
  );
  const load =
    format === 'js'
      ? `await import(${JSON.stringify(pathToFileURL(distEntry).href)});`
      : `require(${JSON.stringify(distEntry)});`;

  return `
    const run = async () => {
      let calls = 0;
      const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
      const randomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto);
      globalThis.crypto.getRandomValues = (array) => {
        calls++;
        return getRandomValues(array);
      };
      globalThis.crypto.randomUUID = () => {
        calls++;
        return randomUUID();
      };

      ${load}

      if (calls > 0) {
        throw new Error(\`Importing ${packageName}/${entry} called crypto.getRandomValues or crypto.randomUUID \${calls} time(s)\`);
      }
    };

    run().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;
}
