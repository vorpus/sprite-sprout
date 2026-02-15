#!/usr/bin/env npx tsx
/**
 * Release script — stamps the unreleased changelog, bumps version, generates
 * docs/CHANGELOG.md, commits, and tags.
 *
 * Usage:
 *   npx tsx scripts/release.ts minor   # 0.1.0 → 0.2.0
 *   npx tsx scripts/release.ts major   # 0.2.0 → 1.0.0
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------------------
// 1. Parse args
// ---------------------------------------------------------------------------

const bump = process.argv[2] as 'major' | 'minor' | undefined;
if (bump !== 'major' && bump !== 'minor') {
  console.error('Usage: npx tsx scripts/release.ts <major|minor>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Read current version from package.json
// ---------------------------------------------------------------------------

const pkgPath = resolve(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const [major, minor] = pkg.version.split('.').map(Number);

const newVersion =
  bump === 'major' ? `${major + 1}.0.0` : `${major}.${minor + 1}.0`;

const today = new Date().toISOString().slice(0, 10);

console.log(`${pkg.version} → ${newVersion}  (${today})`);

// ---------------------------------------------------------------------------
// 3. Update changelog.ts — stamp unreleased → new version
// ---------------------------------------------------------------------------

const changelogTsPath = resolve(ROOT, 'src/lib/changelog.ts');
let changelogTs = readFileSync(changelogTsPath, 'utf-8');

// Verify there's an unreleased entry with items
if (!changelogTs.includes("version: 'unreleased'")) {
  console.error('No unreleased entry found in changelog.ts');
  process.exit(1);
}

// Replace the unreleased entry with the new version + add a fresh unreleased
changelogTs = changelogTs.replace(
  /\{\s*\n\s*version: 'unreleased',\s*\n\s*date: '',/,
  `{\n    version: 'unreleased',\n    date: '',\n    items: [],\n  },\n  {\n    version: '${newVersion}',\n    date: '${today}',`,
);

writeFileSync(changelogTsPath, changelogTs);
console.log('  ✓ changelog.ts updated');

// ---------------------------------------------------------------------------
// 4. Generate docs/CHANGELOG.md from changelog.ts
// ---------------------------------------------------------------------------

// Re-import the updated changelog (dynamic import with cache bust)
const mod = await import(changelogTsPath + '?t=' + Date.now());
const entries: Array<{ version: string; date: string; items: string[] }> =
  mod.changelog;

let md = `# Changelog

All notable changes to Sprite Sprout will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).
`;

for (const entry of entries) {
  if (entry.version === 'unreleased') {
    md += '\n## [Unreleased]\n';
    if (entry.items.length > 0) {
      md += '\n';
      for (const item of entry.items) md += `- ${item}\n`;
    }
  } else {
    md += `\n## [${entry.version}] - ${entry.date}\n\n`;
    for (const item of entry.items) md += `- ${item}\n`;
  }
}

md += '';

const changelogMdPath = resolve(ROOT, 'docs/CHANGELOG.md');
writeFileSync(changelogMdPath, md);
console.log('  ✓ docs/CHANGELOG.md generated');

// ---------------------------------------------------------------------------
// 5. Bump package.json version
// ---------------------------------------------------------------------------

pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('  ✓ package.json bumped');

// ---------------------------------------------------------------------------
// 6. Git commit + tag
// ---------------------------------------------------------------------------

execSync('git add package.json src/lib/changelog.ts docs/CHANGELOG.md', {
  cwd: ROOT,
  stdio: 'inherit',
});
execSync(`git commit -m "Release v${newVersion}"`, {
  cwd: ROOT,
  stdio: 'inherit',
});
execSync(`git tag v${newVersion}`, { cwd: ROOT, stdio: 'inherit' });

console.log(`\n✓ Released v${newVersion}`);
console.log(`  Run \`git push && git push --tags\` when ready.`);
