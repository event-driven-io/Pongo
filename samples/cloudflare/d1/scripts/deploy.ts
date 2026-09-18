import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';

const outputFile = '.wrangler/deploy-output.json';
const token = randomBytes(32).toString('hex');

rmSync(outputFile, { force: true });

execSync('wrangler deploy', {
  stdio: 'inherit',
  env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputFile },
});

execSync('wrangler secret put MIGRATION_TOKEN', {
  input: token,
  stdio: ['pipe', 'inherit', 'inherit'],
});

const deployment = readFileSync(outputFile, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line) as { type: string; targets?: string[] })
  .find((entry) => entry.type === 'deploy');
const url = deployment?.targets?.[0];
if (!url) throw new Error('Wrangler did not report a deployment URL.');

execSync(
  `curl --fail-with-body --retry 5 --retry-all-errors --request POST --header @- ${url}/_system/migrations`,
  {
    input: `Authorization: Bearer ${token}`,
    stdio: ['pipe', 'inherit', 'inherit'],
  },
);

console.log(`Deployed to ${url}`);
