import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { platforms, releaseAssets } from '../scripts/release-config.mjs';
import { collectAssets, packageAssets } from '../scripts/release-assets.mjs';
import { fixture } from './release-fixture.mjs';

test('collects exactly eight installers from six architectures and verifies SHA-256', (t) => {
  const { root } = fixture(t);
  const output = join(root, 'assets');
  for (const platform of platforms) {
    for (const asset of releaseAssets('2.0.0', [platform])) {
      const directory = join(
        root,
        'src-tauri/target',
        platform.target,
        'release/bundle',
        asset.bundle,
      );
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, `original${asset.extension}`), asset.name);
    }
    packageAssets(platform.id, output, root);
  }
  assert.equal(collectAssets(output, root).length, 9);
  const checksum = readFileSync(join(output, 'SHA256SUMS.txt'), 'utf8');
  for (const { name } of releaseAssets('2.0.0'))
    assert.ok(checksum.includes(`${createHash('sha256').update(name).digest('hex')}  ${name}\n`));
  assert.equal(collectAssets(output, root).length, 9);
  const first = releaseAssets('2.0.0')[0].name;
  rmSync(join(output, first));
  assert.throws(() => collectAssets(output, root), /asset|installer/i);
  writeFileSync(join(output, first), '');
  assert.throws(() => collectAssets(output, root), /empty/i);
  writeFileSync(join(output, first), 'package');
  writeFileSync(join(output, 'unexpected.exe'), 'package');
  assert.throws(() => collectAssets(output, root), /asset|installer/i);
});

test('does not choose arbitrarily between stale and current bundles', (t) => {
  const { root } = fixture(t);
  const directory = join(root, 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis');
  mkdirSync(directory, { recursive: true });
  for (const name of ['old.exe', 'new.exe']) writeFileSync(join(directory, name), 'package');
  assert.throws(() => packageAssets('windows-x64', join(root, 'assets'), root), /exactly one/i);
});
