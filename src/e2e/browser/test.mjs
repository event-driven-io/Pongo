import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('installed Pongo packages in a browser', () => {
  let server;
  let browser;
  let page;
  const pageErrors = [];

  beforeAll(async () => {
    server = await createServer({
      root: fileURLToPath(new URL('.', import.meta.url)),
      configFile: false,
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    browser = await chromium.launch();
    page = await browser.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it.each(['mongodb', '@types/mongodb', 'bson', 'pg', 'sqlite3'])(
    'does not require installing %s',
    (dependency) => {
      const specifier = dependency.startsWith('@types/')
        ? `${dependency}/package.json`
        : dependency;
      expect(() => require.resolve(specifier)).toThrow();
    },
  );

  it('installs the required type shims with Pongo', () => {
    const pongo = JSON.parse(
      readFileSync(
        new URL(
          './node_modules/@event-driven-io/pongo/package.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const shims = JSON.parse(
      readFileSync(
        new URL(
          './node_modules/@event-driven-io/pongo-shims/package.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );

    expect(pongo.dependencies).toHaveProperty('@event-driven-io/pongo-shims');
    expect(shims.dependencies ?? {}).toEqual({});
  });

  it('ships only declarations and preserves the upstream license notices', () => {
    const shimsDirectory = new URL(
      './node_modules/@event-driven-io/pongo-shims/',
      import.meta.url,
    );
    const artifacts = readdirSync(new URL('dist/', shimsDirectory), {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    expect(artifacts).toEqual(
      expect.arrayContaining(['mongodb.d.ts', 'mongodb.d.cts']),
    );
    expect(artifacts.every((name) => /\.d\.(?:ts|cts)$/.test(name))).toBe(true);

    for (const file of ['mongodb.d.ts', 'mongodb.d.cts']) {
      const declarations = readFileSync(
        new URL(`dist/${file}`, shimsDirectory),
        'utf8',
      );
      const declarationsWithoutComments = declarations.replace(
        /\/\*[\s\S]*?\*\//g,
        '',
      );
      expect(declarationsWithoutComments).not.toMatch(
        /(?:from\s*|import\s*\()\s*['"](?:mongodb|bson)(?:\/|['"])/,
      );
    }

    for (const file of [
      'LICENSE',
      'licenses/mongodb-LICENSE.md',
      'licenses/bson-LICENSE.md',
    ]) {
      const license = readFileSync(new URL(file, shimsDirectory), 'utf8');
      expect(license).toContain('Apache License');
      expect(license).toContain('Version 2.0');
    }

    const notice = readFileSync(new URL('NOTICE', shimsDirectory), 'utf8');
    expect(notice).toContain('mongodb');
    expect(notice).toContain('bson');
  });

  it('constructs clients, schemas, and caches without Node globals', async () => {
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.pongoBrowser !== undefined);

    expect(await page.evaluate(() => window.pongoBrowser)).toEqual({
      collectionName: 'users',
      shimCollectionName: 'users',
      cachedDocument: { _id: '1', name: 'Ada' },
      processType: 'undefined',
      bufferType: 'undefined',
      requireType: 'undefined',
    });
    expect(pageErrors).toEqual([]);
  });
});
