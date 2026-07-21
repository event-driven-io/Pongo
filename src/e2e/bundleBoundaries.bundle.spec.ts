import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type ModuleFormat = 'cjs' | 'js';

const bundleDefinitions = {
  dumbo: {
    index:
      /^(?:core\/|storage\/all\/|storage\/postgresql\/core\/(?:connections\/connectionString|schema\/(?:schema|postgreSQLMetadata))\.ts$|storage\/sqlite\/core\/schema\/(?:schema|sqliteMetadata)\.ts$|index\.ts$)/,
    postgresql: /^(?:core\/|storage\/postgresql\/core\/|postgresql\.ts$)/,
    pg: /^(?:core\/|storage\/postgresql\/|pg\.ts$)/,
    sqlite: /^(?:core\/|storage\/sqlite\/core\/|sqlite\.ts$)/,
    sqlite3: /^(?:core\/|storage\/sqlite\/(?:core|sqlite3)\/|sqlite3\.ts$)/,
    cloudflare: /^(?:core\/|storage\/sqlite\/(?:core|d1)\/|cloudflare\.ts$)/,
  },
  pongo: {
    index: /^(?:core\/|storage\/|(?:index|pg|sqlite3|cloudflare)\.ts$)/,
    shim: /^(?:core\/|mongo\/|shim\.ts$)/,
    cli: /^(?:core\/|commandLine\/|cli\.ts$)/,
    pg: /^(?:core\/|storage\/postgresql\/|pg\.ts$)/,
    sqlite3: /^(?:core\/|storage\/sqlite\/(?:core|sqlite3)\/|sqlite3\.ts$)/,
    cloudflare: /^(?:core\/|storage\/sqlite\/(?:core|d1)\/|cloudflare\.ts$)/,
  },
} as const;

const localImportPatterns: Record<ModuleFormat, RegExp> = {
  cjs: /require\(['"]\.\/([^'"]+\.cjs)['"]\)/g,
  js: /(?:from\s+|import\s*\()\s*['"]\.\/([^'"]+\.js)['"]/g,
};

const moduleSpecifierPatterns: Record<ModuleFormat, RegExp> = {
  cjs: /require\(['"]([^'"]+)['"]\)/g,
  js: /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g,
};

const forbiddenExternalImports: Record<string, Record<string, string[]>> = {
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

const reachableFiles = (
  distDirectory: string,
  entry: string,
  format: ModuleFormat,
): Set<string> => {
  const pending = [`${entry}.${format}`];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const file = pending.pop();

    if (file === undefined || visited.has(file)) continue;

    visited.add(file);
    const source = fs.readFileSync(path.join(distDirectory, file), 'utf8');
    const directory = path.posix.dirname(file);
    pending.push(
      ...[...source.matchAll(localImportPatterns[format])].map(
        (match) => path.posix.normalize(path.posix.join(directory, match[1])),
      ),
    );
  }

  return visited;
};

const externalImports = (
  distDirectory: string,
  file: string,
  format: ModuleFormat,
): string[] => {
  const source = fs.readFileSync(path.join(distDirectory, file), 'utf8');

  return [...source.matchAll(moduleSpecifierPatterns[format])]
    .map((match) => match[1])
    .filter(
      (specifier) =>
        !specifier.startsWith('.') &&
        !specifier.startsWith('node:') &&
        specifier !== undefined,
    );
};

const packageSourceFromSourceMap = (
  source: string,
  packageName: string,
  sourceMapFile: string,
): string | undefined => {
  const sourcePath = path.resolve(path.dirname(sourceMapFile), source);
  const packageSourceRoot = path.resolve(`packages/${packageName}/src`);
  const relativeSource = path.relative(packageSourceRoot, sourcePath);

  return relativeSource.startsWith('..') || path.isAbsolute(relativeSource)
    ? undefined
    : relativeSource.replaceAll(path.sep, '/');
};

describe.each(Object.entries(bundleDefinitions))(
  '%s bundle boundaries',
  (packageName, definitions) => {
    const distDirectory = path.resolve(`packages/${packageName}/dist`);
    const entries = Object.keys(definitions);

    it.each<ModuleFormat>(['cjs', 'js'])(
      'keeps public %s entries in independent graphs',
      (format) => {
        for (const entry of entries) {
          const reachable = reachableFiles(distDirectory, entry, format);
          const otherEntries = entries
            .filter((otherEntry) => otherEntry !== entry)
            .map((otherEntry) => `${otherEntry}.${format}`);

          expect(
            [...reachable].filter((file) => otherEntries.includes(file)),
            `${packageName}/${entry}.${format} reaches another public entry`,
          ).toEqual([]);
        }
      },
    );
  },
);

describe.each(Object.entries(bundleDefinitions))(
  '%s optional dependency boundaries',
  (packageName, definitions) => {
    const distDirectory = path.resolve(`packages/${packageName}/dist`);

    it.each<ModuleFormat>(['cjs', 'js'])(
      'keeps forbidden peer imports out of %s graphs',
      (format) => {
        for (const entry of Object.keys(definitions)) {
          const forbidden = forbiddenExternalImports[packageName]?.[entry] ?? [];
          const unexpectedImports = [...reachableFiles(distDirectory, entry, format)]
            .flatMap((file) =>
              externalImports(distDirectory, file, format).map(
                (specifier) => `${file}: ${specifier}`,
              ),
            )
            .filter((specifier) =>
              forbidden.some((dependency) =>
                specifier.endsWith(`: ${dependency}`),
              ),
            );

          expect(
            unexpectedImports,
            `${packageName}/${entry}.${format} imports an optional dependency from another entry`,
          ).toEqual([]);
        }
      },
    );
  },
);

describe.each(Object.entries(bundleDefinitions))(
  '%s source boundaries',
  (packageName, definitions) => {
    const distDirectory = path.resolve(`packages/${packageName}/dist`);

    it.each<ModuleFormat>(['cjs', 'js'])(
      'keeps every %s graph within its allowed sources',
      (format) => {
        for (const [entry, allowedSource] of Object.entries(definitions)) {
          const reachable = reachableFiles(distDirectory, entry, format);
          const unexpectedSources: string[] = [];

          for (const file of reachable) {
            const sourceMapFile = path.join(distDirectory, `${file}.map`);
            if (!fs.existsSync(sourceMapFile)) continue;

            const sourceMap = JSON.parse(
              fs.readFileSync(sourceMapFile, 'utf8'),
            ) as { sources: string[] };

            for (const source of sourceMap.sources) {
              const packageSource = packageSourceFromSourceMap(
                source,
                packageName,
                sourceMapFile,
              );

              if (
                packageSource !== undefined &&
                !allowedSource.test(packageSource)
              ) {
                unexpectedSources.push(`${file}: ${packageSource}`);
              }
            }
          }

          expect(
            unexpectedSources,
            `${packageName}/${entry}.${format} crosses a source boundary`,
          ).toEqual([]);
        }
      },
    );
  },
);

describe('pongo package types', () => {
  it('keeps root and driver subpath declarations type-compatible', () => {
    const tempDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'pongo-types-'),
    );
    const sourceFile = path.join(tempDirectory, 'consumer.ts');
    const pongoDist = path
      .relative(tempDirectory, path.resolve('packages/pongo/dist'))
      .replaceAll(path.sep, '/');
    const pongoImport = pongoDist.startsWith('.')
      ? pongoDist
      : `./${pongoDist}`;

    fs.writeFileSync(
      sourceFile,
      `
        import type { AnyPongoDriver } from '${pongoImport}/index.js';
        import { pongoDriver as pgDriver } from '${pongoImport}/pg.js';
        import { pongoDriver as sqlite3Driver } from '${pongoImport}/sqlite3.js';
        import { pongoDriver as d1Driver } from '${pongoImport}/cloudflare.js';

        const drivers: AnyPongoDriver[] = [
          pgDriver,
          sqlite3Driver,
          d1Driver,
        ];

        void drivers;
      `,
    );

    const program = ts.createProgram([sourceFile], {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ESNext,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);

    expect(
      diagnostics.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      ),
    ).toEqual([]);
  });
});

describe('dumbo package types', () => {
  it('keeps root and driver subpath declarations type-compatible', () => {
    const tempDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'dumbo-types-'),
    );
    const sourceFile = path.join(tempDirectory, 'consumer.ts');
    const dumboDist = path
      .relative(tempDirectory, path.resolve('packages/dumbo/dist'))
      .replaceAll(path.sep, '/');
    const dumboImport = dumboDist.startsWith('.')
      ? dumboDist
      : `./${dumboDist}`;

    fs.writeFileSync(
      sourceFile,
      `
        import type { AnyDumboDatabaseDriver } from '${dumboImport}/index.js';
        import { pgDumboDriver } from '${dumboImport}/pg.js';
        import { sqlite3DumboDriver } from '${dumboImport}/sqlite3.js';
        import { d1DumboDriver } from '${dumboImport}/cloudflare.js';

        const drivers: AnyDumboDatabaseDriver[] = [
          pgDumboDriver,
          sqlite3DumboDriver,
          d1DumboDriver,
        ];

        void drivers;
      `,
    );

    const program = ts.createProgram([sourceFile], {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ESNext,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);

    expect(
      diagnostics.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      ),
    ).toEqual([]);
  });
});
