#!/usr/bin/env node

/**
 * Preinstall guard.
 *
 * Blocks non-pnpm installs that bypass the primary guards:
 *   npm  — engine-strict + engines.npm sentinel in package.json
 *   bun  — frozenLockfile in bunfig.toml
 *   yarn — packageManager field in package.json
 *
 * This script catches the remaining bypass: `bun install --no-frozen-lockfile`.
 * It also enforces the required Node.js version for pnpm installs.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const execPath = process.env.npm_execpath || '';

// Block any package manager other than pnpm.
// An unset execPath (direct node invocation) is allowed through.
if (execPath && !execPath.includes('pnpm')) {
  const root = path.resolve(__dirname, '..');

  // Clean up any partial bun install artifacts before aborting.
  fs.rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });

  // Restore the sentinel bun.lock so frozenLockfile blocks the next plain
  // "bun install". Bun overwrites it during --no-frozen-lockfile installs.
  // Also delete bun.lockb (bun's legacy binary format) if present.
  try {
    execSync('git checkout -- bun.lock', { cwd: root, stdio: 'pipe' });
  } catch {
    /* best-effort — not a git repo or file not tracked */
  }
  try {
    fs.unlinkSync(path.join(root, 'bun.lockb'));
  } catch {
    /* best-effort */
  }

  // Bun migrates overrides from pnpm-workspace.yaml into package.json during
  // workspace parsing — before lockfile validation and before this script runs.
  // Surgically remove only the injected "overrides" key so uncommitted
  // intentional changes to package.json are preserved.
  try {
    const pkgPath = path.join(root, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.overrides) {
      delete pkg.overrides;
      fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
    }
  } catch {
    /* best-effort */
  }

  console.error('');
  console.error('  [dops-github-actions] ERROR: This repository requires pnpm.');
  console.error('  Do not use npm install, yarn install, or bun install.');
  console.error('');
  console.error('  Install pnpm:  npm install -g pnpm@11.9.0');
  console.error('  Then run:      pnpm install');
  console.error('');
  process.exit(1);
}

// Enforce Node.js version for pnpm installs.
// Skip inside .serverless — Serverless Framework manages its own runtime.
if (!process.cwd().includes('.serverless')) {
  const major = parseInt(process.version.slice(1), 10);
  if (major < 24 || major >= 25) {
    console.error('');
    console.error(`  [dops-github-actions] ERROR: Node.js ${process.version} is not supported.`);
    console.error('  This repository requires Node.js >=24.0.0 <25.0.0.');
    console.error('');
    console.error('  Update Node:   nvm install 24 && nvm use 24');
    console.error('');
    process.exit(1);
  }
}
