import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { bumpVersion, readVersion, versionFiles } from '../scripts/release-version.mjs';
import { fixture } from './release-fixture.mjs';

const runner = resolve('tests/fixtures/release-gh.ps1');
function invoke(root, args = ['-Publish'], failure = '') {
  const result = spawnSync('pwsh', ['-NoProfile', '-File', runner, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, RELEASE_TEST_FAILURE: failure },
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}
function published(f, version) {
  const sha = f.git('rev-parse', 'HEAD');
  assert.equal(readVersion(f.root), version);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(f.git('rev-parse', `v${version}^{commit}`), sha);
  assert.ok(f.git('ls-remote', 'origin', 'refs/heads/main').includes(sha));
  assert.ok(f.git('ls-remote', 'origin', `refs/tags/v${version}^{}`).includes(sha));
}

test('default patch releases update only version files and atomically publish commit/tag', (t) => {
  const f = fixture(t);
  for (const version of ['2.0.1', '2.0.2']) {
    const result = invoke(f.root);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /Release published and verified/);
    published(f, version);
    assert.deepEqual(
      f.git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n').sort(),
      [...versionFiles].sort(),
    );
  }
});

test('explicit new or already committed versions are supported without empty commits', (t) => {
  const f = fixture(t);
  let result = invoke(f.root, ['-Publish', '-Version', '2.1.0']);
  assert.equal(result.status, 0, result.output);
  published(f, '2.1.0');
  bumpVersion('2.2.0', f.root);
  f.git('commit', '-am', 'Prepare version');
  f.git('push', 'origin', 'main');
  const sha = f.git('rev-parse', 'HEAD');
  result = invoke(f.root, ['-Publish', '-Version', '2.2.0']);
  assert.equal(result.status, 0, result.output);
  assert.equal(f.git('rev-parse', 'HEAD'), sha);
  published(f, '2.2.0');
});

test('help, missing Publish and invalid versions cannot mutate the repository', (t) => {
  const f = fixture(t);
  const sha = f.git('rev-parse', 'HEAD');
  assert.equal(invoke(f.root, ['-Help']).status, 0);
  assert.equal(invoke(f.root, []).status, 1);
  for (const version of ['banana', 'v2.1.0', '02.1.0', '2.1.0-beta.1', '1.9.9'])
    assert.equal(invoke(f.root, ['-Publish', '-Version', version]).status, 1);
  assert.equal(f.git('rev-parse', 'HEAD'), sha);
  assert.equal(f.git('status', '--porcelain'), '');
});

for (const location of ['local', 'remote'])
  test(`rejects an existing ${location} tag before bumping`, (t) => {
    const f = fixture(t);
    f.git('tag', 'v2.0.1');
    if (location === 'remote') {
      f.git('push', 'origin', 'refs/tags/v2.0.1');
      f.git('tag', '-d', 'v2.0.1');
    }
    const result = invoke(f.root);
    assert.equal(result.status, 1);
    assert.match(result.output, /tag v2.0.1 already exists/);
    assert.equal(f.git('status', '--porcelain'), '');
  });

for (const condition of [
  'dirty',
  'unpushed',
  'branch',
  'mismatch',
  'config',
  'existing-release',
  'api-failure',
])
  test(`rejects ${condition} state before creating a release commit`, (t) => {
    const f = fixture(t);
    if (condition === 'dirty') f.put('pending.txt', 'user edits');
    if (condition === 'unpushed') f.git('commit', '--allow-empty', '-m', 'Unpushed');
    if (condition === 'branch') f.git('checkout', '-b', 'feature');
    if (condition === 'mismatch') {
      f.put('src-tauri/tauri.conf.json', '{"version":"2.0.1"}');
      f.git('commit', '-am', 'Mismatch');
      f.git('push', 'origin', 'main');
    }
    const sha = f.git('rev-parse', 'HEAD');
    const before = f.git('status', '--porcelain');
    const result = invoke(f.root, ['-Publish'], condition);
    assert.equal(result.status, 1, result.output);
    assert.equal(f.git('rev-parse', 'HEAD'), sha);
    assert.equal(f.git('status', '--porcelain'), before);
    assert.equal(f.git('tag', '--list', 'v2.0.1'), '');
  });

test('atomic push failure preserves remote refs and leaves a local retryable commit/tag', (t) => {
  const f = fixture(t);
  const sha = f.git('rev-parse', 'HEAD');
  f.git('--git-dir', f.remote, 'config', 'receive.denyCurrentBranch', 'refuse');
  f.git('--git-dir', f.remote, 'config', 'core.bare', 'false');
  f.git('--git-dir', f.remote, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const result = invoke(f.root);
  assert.equal(result.status, 1);
  assert.match(result.output, /git push --atomic origin main refs\/tags\/v2.0.1/);
  assert.ok(f.git('ls-remote', 'origin', 'refs/heads/main').includes(sha));
  assert.equal(f.git('ls-remote', 'origin', 'refs/tags/v2.0.1'), '');
  assert.equal(f.git('rev-parse', 'v2.0.1^{commit}'), f.git('rev-parse', 'HEAD'));
});

for (const failure of ['workflow', 'asset', 'empty', 'draft'])
  test(`reports ${failure} failure after pushing without claiming success`, (t) => {
    const f = fixture(t);
    const result = invoke(f.root, ['-Publish'], failure);
    assert.equal(result.status, 1, result.output);
    assert.doesNotMatch(result.output, /Release published and verified/);
    published(f, '2.0.1');
  });
