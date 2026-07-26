import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const testFiles = readdirSync(testsDirectory)
  .filter((fileName) => fileName.endsWith('.test.js'))
  .sort();

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, ['--test', join(testsDirectory, testFile)], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
