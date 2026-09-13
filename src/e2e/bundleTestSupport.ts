import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

export type ModuleFormat = 'cjs' | 'js';
export type PackageName = 'dumbo' | 'pongo';

const localImportPatterns: Record<ModuleFormat, RegExp> = {
  cjs: /require\(['"]\.\/([^'"]+\.cjs)['"]\)/g,
  js: /(?:from\s+|import\s*\()\s*['"]\.\/([^'"]+\.js)['"]/g,
};

const moduleSpecifierPatterns: Record<ModuleFormat, RegExp> = {
  cjs: /require\(['"]([^'"]+)['"]\)/g,
  js: /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g,
};

export const reachableFiles = (
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
      ...[...source.matchAll(localImportPatterns[format])].map((match) =>
        path.posix.normalize(path.posix.join(directory, match[1])),
      ),
    );
  }

  return visited;
};

export const externalImports = (
  distDirectory: string,
  file: string,
  format: ModuleFormat,
): string[] => {
  const source = fs.readFileSync(path.join(distDirectory, file), 'utf8');

  return [...source.matchAll(moduleSpecifierPatterns[format])]
    .map((match) => match[1])
    .filter(
      (specifier) =>
        specifier !== undefined &&
        !specifier.startsWith('.') &&
        !specifier.startsWith('node:'),
    );
};

export const bundledPackageSources = (
  packageName: PackageName,
  distDirectory: string,
  entry: string,
  format: ModuleFormat,
): ReadonlyArray<Readonly<{ bundleFile: string; packageSource: string }>> =>
  [...reachableFiles(distDirectory, entry, format)].flatMap((bundleFile) => {
    const sourceMapFile = path.join(distDirectory, `${bundleFile}.map`);
    if (!fs.existsSync(sourceMapFile)) return [];

    const sourceMap = JSON.parse(fs.readFileSync(sourceMapFile, 'utf8')) as {
      sources: string[];
    };
    const packageSourceRoot = path.resolve(`packages/${packageName}/src`);

    return sourceMap.sources.flatMap((source) => {
      const sourcePath = path.resolve(path.dirname(sourceMapFile), source);
      const packageSource = path.relative(packageSourceRoot, sourcePath);

      return packageSource.startsWith('..') || path.isAbsolute(packageSource)
        ? []
        : [
            {
              bundleFile,
              packageSource: packageSource.replaceAll(path.sep, '/'),
            },
          ];
    });
  });

export const typeCheckConsumer = (
  packageName: PackageName,
  source: (packageImport: string) => string,
): string[] => {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), `${packageName}-types-`),
  );

  try {
    const sourceFile = path.join(tempDirectory, 'consumer.ts');
    const relativePackageDist = path
      .relative(tempDirectory, path.resolve(`packages/${packageName}/dist`))
      .replaceAll(path.sep, '/');
    const packageImport = relativePackageDist.startsWith('.')
      ? relativePackageDist
      : `./${relativePackageDist}`;

    fs.writeFileSync(sourceFile, source(packageImport));

    const program = ts.createProgram([sourceFile], {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ESNext,
    });

    return ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
};

export const runNodeConsumer = (format: ModuleFormat, source: string) => {
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'pongo-runtime-'),
  );
  const consumerFile = path.join(
    tempDirectory,
    `consumer.${format === 'js' ? 'mjs' : 'cjs'}`,
  );

  try {
    fs.writeFileSync(consumerFile, source);
    return spawnSync(process.execPath, [consumerFile], { encoding: 'utf8' });
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
};
