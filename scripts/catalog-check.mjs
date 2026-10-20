#!/usr/bin/env node
// Checks that every folder in packages/ is listed in CATALOG.md and follows the
// package template from packages/README.md. Exit code 1 (with a list) if not.
// Node only, no dependencies. Usage: node scripts/catalog-check.mjs [repoRoot]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const packagesDir = path.join(root, 'packages');
const catalogFile = path.join(root, 'CATALOG.md');
const README_SECTIONS = ['What it does', 'How to use', 'Determinism'];

const read = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const catalog = read(catalogFile);
const problems = []; // [folder, message]

if (catalog === null) problems.push(['(repo)', 'CATALOG.md is missing at the repo root']);

const folders = fs.readdirSync(packagesDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.'))
  .map(d => d.name)
  .sort();

for (const name of folders) {
  const dir = path.join(packagesDir, name);
  const fullName = `@pvp/${name}`;
  const add = msg => problems.push([name, msg]);

  // Listed in the catalog: in the table and with its own section heading.
  if (catalog !== null) {
    const id = escape(fullName);
    if (!new RegExp(`^\\|.*\`${id}\``, 'm').test(catalog)) add('not in the CATALOG.md table');
    if (!new RegExp(`^#{2,4} .*${id}(?![\\w-])`, 'm').test(catalog)) add('has no section in CATALOG.md');
  }

  // package.json
  const pkgText = read(path.join(dir, 'package.json'));
  if (pkgText === null) {
    add('package.json is missing');
  } else {
    let pkg = null;
    try { pkg = JSON.parse(pkgText); } catch { add('package.json is not valid JSON'); }
    if (pkg) {
      if (pkg.name !== fullName) add(`package.json name is "${pkg.name}", expected "${fullName}"`);
      if (pkg.type !== 'module') add('package.json needs "type": "module"');
    }
  }

  // src/index.js
  if (!fs.existsSync(path.join(dir, 'src', 'index.js'))) add('src/index.js is missing');

  // at least one test/*.test.js
  const testDir = path.join(dir, 'test');
  const tests = fs.existsSync(testDir) ? fs.readdirSync(testDir).filter(f => f.endsWith('.test.js')) : [];
  if (tests.length === 0) add('no test/*.test.js file');

  // README sections
  const readme = read(path.join(dir, 'README.md'));
  if (readme === null) {
    add('README.md is missing');
  } else {
    for (const section of README_SECTIONS) {
      if (!new RegExp(`^#{1,6}\\s+${escape(section)}\\s*$`, 'im').test(readme)) add(`README.md has no "${section}" section`);
    }
  }
}

if (problems.length) {
  console.error(`catalog:check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
  for (const [name, msg] of problems) console.error(`  - ${name}: ${msg}`);
  console.error('See packages/README.md (template) and CATALOG.md.');
  process.exit(1);
}
console.log(`catalog:check ok: ${folders.length} packages, all in CATALOG.md and following the template.`);
