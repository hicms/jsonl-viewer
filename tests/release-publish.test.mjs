import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { publishRelease } from '../scripts/publish-release.mjs';
import { releaseAssets } from '../scripts/release-config.mjs';
import { fixture } from './release-fixture.mjs';

function setup(t, state = 'missing', broken = '') {
  const f = fixture(t);
  const directory = join(f.root, 'assets');
  const notes = join(f.root, 'notes.md');
  mkdirSync(directory);
  for (const { name } of releaseAssets('2.0.0'))
    writeFileSync(join(directory, name), `installer ${name}`);
  writeFileSync(notes, 'Release notes');
  let release =
    state === 'missing'
      ? null
      : {
          draft: state !== 'published',
          target_commitish: state === 'different' ? 'other-sha' : f.git('rev-parse', 'HEAD'),
          assets: [],
        };
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    const command = args.slice(0, 2).join(' ');
    if (command === 'repo view') {
      assert.equal(args[2], f.git('remote', 'get-url', 'origin'));
      return 'example/viewer';
    }
    if (args[0] === 'api') {
      if (args[1].includes('/tags/')) throw new Error('Tag endpoint does not return drafts.');
      if (args[1].endsWith('releases/42') && !release) throw new Error('Release not found.');
      return release ? JSON.stringify(release) : '';
    }
    if (command === 'release view') return JSON.stringify({ databaseId: 42 });
    if (command === 'release create') {
      release = { draft: true, target_commitish: f.git('rev-parse', 'HEAD'), assets: [] };
      return '';
    }
    if (command === 'release upload') {
      release.assets = args.slice(3, args.indexOf('--repo')).map((path) => ({
        name: path.split(/[\\/]/).at(-1),
        size: statSync(path).size,
        state: 'uploaded',
        digest: `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`,
      }));
      if (broken === 'missing') release.assets.pop();
      if (broken === 'digest') release.assets[0].digest = 'sha256:wrong';
      if (broken === 'size') release.assets[0].size = 0;
      if (broken === 'extra') release.assets.push({ name: 'extra.zip' });
      return '';
    }
    if (command === 'release edit') return '';
    throw new Error(`Unexpected gh call: ${args}`);
  };
  return { ...f, directory, notes, gh, calls };
}

for (const state of ['missing', 'draft'])
  test(`publishes ${state} release only after all nine uploads verify`, (t) => {
    const f = setup(t, state);
    publishRelease('v2.0.0', f.directory, f.notes, { root: f.root, gh: f.gh });
    assert.ok(f.calls.at(-1).includes('--draft=false'));
    assert.equal(
      f.calls.filter((args) => args[1] === 'create').length,
      state === 'missing' ? 1 : 0,
    );
  });

for (const state of ['published', 'different'])
  test(`refuses to overwrite ${state} release`, (t) => {
    const f = setup(t, state);
    assert.throws(() => publishRelease('v2.0.0', f.directory, f.notes, { root: f.root, gh: f.gh }));
    assert.equal(f.calls.filter((args) => args[0] === 'release').length, 0);
  });

for (const failure of ['missing', 'digest', 'size', 'extra'])
  test(`leaves failed ${failure} uploads as a draft`, (t) => {
    const f = setup(t, 'missing', failure);
    assert.throws(() => publishRelease('v2.0.0', f.directory, f.notes, { root: f.root, gh: f.gh }));
    assert.ok(f.calls.every((args) => !args.includes('--draft=false')));
  });

test('wrong version or tag commit cannot create a release', (t) => {
  const f = setup(t);
  assert.throws(
    () => publishRelease('v2.1.0', f.directory, f.notes, { root: f.root, gh: f.gh }),
    /versions must match/,
  );
  f.git('commit', '--allow-empty', '-m', 'Later commit');
  assert.throws(
    () => publishRelease('v2.0.0', f.directory, f.notes, { root: f.root, gh: f.gh }),
    /point to HEAD/,
  );
  assert.equal(f.calls.length, 0);
});
