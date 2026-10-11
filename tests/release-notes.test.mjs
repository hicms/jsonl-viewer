import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateNotes } from '../scripts/generate-release-notes.mjs';
import { fixture } from './release-fixture.mjs';
import { releaseAssets } from '../scripts/release-config.mjs';

test('uses reachable stable history, retains commit bodies, and filters version-only commits', (t) => {
  const { root, git } = fixture(t);
  git('checkout', '-b', 'unrelated');
  git('commit', '--allow-empty', '-m', 'not in this release');
  git('tag', 'v2.0.8');
  git('checkout', 'main');
  git(
    'commit',
    '--allow-empty',
    '-m',
    'feat: add ARM [native]',
    '-m',
    'Original details\nSecond line',
  );
  git('commit', '--allow-empty', '-m', 'fix: 文件打开');
  git('commit', '--allow-empty', '-m', 'Release v2.0.9');
  git('tag', 'v2.0.9');
  const notes = generateNotes('v2.0.9', { root });
  assert.match(notes, /v2.0.0 → v2.0.9 · 2 commits/);
  assert.match(notes, /### Features/);
  assert.match(notes, /### Fixes/);
  assert.ok(notes.includes('feat: add ARM \\[native\\]'));
  assert.match(notes, /> Original details\n  > Second line/);
  assert.doesNotMatch(notes, /not in this release|Release v2.0.9/);
  for (const { name } of releaseAssets('2.0.9'))
    assert.ok(notes.includes(`/releases/download/v2.0.9/${name}`));
  assert.match(notes, /blob\/v2.0.9\/README.md/);
  assert.match(notes, /without Apple notarization/);
});

test('first release and preview use correct history and immutable documentation', (t) => {
  const { root, git } = fixture(t);
  assert.match(generateNotes('v2.0.0', { root }), /Initial release/);
  git('commit', '--allow-empty', '-m', 'Release v2.0.1', '-m', 'Meaningful release details');
  const preview = generateNotes('v2.0.1', { root, preview: true });
  assert.match(preview, /Preview only/);
  assert.match(preview, /Meaningful release details/);
  assert.ok(preview.includes(`/blob/${git('rev-parse', 'HEAD')}/README.md`));
  assert.throws(() => generateNotes('v02.0.1', { root }));
  assert.throws(() => generateNotes('v2.0.1', { root }));
});
