import fs from 'node:fs';
import path from 'node:path';
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
    pending.push(
      ...[...source.matchAll(localImportPatterns[format])].map(
        (match) => match[1],
      ),
    );
  }

  return visited;
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
            const sourceMap = JSON.parse(
              fs.readFileSync(path.join(distDirectory, `${file}.map`), 'utf8'),
            ) as { sources: string[] };

            for (const source of sourceMap.sources) {
              const packageSource = source.match(/(?:^|\/)src\/(.+)$/)?.[1];

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
