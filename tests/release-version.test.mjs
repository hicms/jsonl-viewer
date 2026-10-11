import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bumpVersion, readVersion, versionFiles } from '../scripts/release-version.mjs';
import { fixture } from './release-fixture.mjs';

test('updates all manifests and both lockfiles without changing dependencies', (t) => {
  const { root } = fixture(t);
  assert.equal(bumpVersion('2.1.0', root), '2.1.0');
  assert.equal(readVersion(root), '2.1.0');
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json')));
  assert.equal(lock.packages['node_modules/dependency'].version, '2.0.0');
  assert.match(
    readFileSync(join(root, 'src-tauri/Cargo.lock'), 'utf8'),
    /name = "dependency"\nversion = "2.0.0"/,
  );
  assert.match(readFileSync(join(root, 'src-tauri/Cargo.toml'), 'utf8'), /dependency = "2.0.0"/);
  assert.equal(bumpVersion('2.1.0', root), '2.1.0');
});

test('invalid, older and inconsistent versions fail without writing any files', (t) => {
  const { root, put } = fixture(t);
  const contents = () => versionFiles.map((file) => readFileSync(join(root, file), 'utf8'));
  const before = contents();
  for (const value of ['1.9.9', 'v2.1.0', '02.1.0', '2.1.0-beta.1', 'banana'])
    assert.throws(() => bumpVersion(value, root));
  assert.deepEqual(contents(), before);
  put('src-tauri/tauri.conf.json', '{"version":"2.0.1"}');
  const inconsistent = contents();
  assert.throws(() => bumpVersion('2.1.0', root), /must match/);
  assert.deepEqual(contents(), inconsistent);
});
