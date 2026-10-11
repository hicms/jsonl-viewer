import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { collectAssets } from './release-assets.mjs';
import { readVersion } from './release-version.mjs';
import { versionFromTag } from './release-config.mjs';

export function publishRelease(tag, directory, notes, { root = process.cwd(), gh = runGh } = {}) {
  if (versionFromTag(tag) !== readVersion(root))
    throw new Error('Tag and package versions must match.');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const sha = git('rev-parse', 'HEAD');
  if (git('rev-parse', `refs/tags/${tag}^{commit}`) !== sha)
    throw new Error('Release tag must point to HEAD.');
  const names = collectAssets(directory, root);
  if (!readFileSync(notes, 'utf8').trim()) throw new Error('Release notes are empty.');
  const repo = gh([
    'repo',
    'view',
    git('remote', 'get-url', 'origin'),
    '--json',
    'nameWithOwner',
    '--jq',
    '.nameWithOwner',
  ]).trim();
  const findRelease = () =>
    gh([
      'api',
      `repos/${repo}/releases?per_page=100`,
      '--paginate',
      '--jq',
      `.[] | select(.tag_name == "${tag}")`,
    ]).trim();
  let release = findRelease();
  if (release) {
    release = JSON.parse(release);
    if (!release.draft) throw new Error(`${tag} is already published; refusing to overwrite it.`);
    if (release.target_commitish !== sha)
      throw new Error('Existing draft belongs to a different commit.');
  } else {
    gh([
      'release',
      'create',
      tag,
      '--repo',
      repo,
      '--verify-tag',
      '--target',
      sha,
      '--title',
      `JSONL Viewer ${tag}`,
      '--notes-file',
      notes,
      '--draft',
    ]);
  }
  gh(['release', 'edit', tag, '--repo', repo, '--notes-file', notes]);
  gh([
    'release',
    'upload',
    tag,
    ...names.map((name) => join(directory, name)),
    '--repo',
    repo,
    '--clobber',
  ]);
  const { databaseId } = JSON.parse(
    gh(['release', 'view', tag, '--repo', repo, '--json', 'databaseId']),
  );
  release = JSON.parse(gh(['api', `repos/${repo}/releases/${databaseId}`]));
  if (!release.draft || release.target_commitish !== sha)
    throw new Error('Draft changed while uploading assets.');
  const actual = release.assets.map((asset) => asset.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...names].sort()))
    throw new Error('Draft release has missing or unexpected assets.');
  for (const asset of release.assets) {
    const file = join(directory, asset.name);
    const digest = `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
    if (asset.size !== statSync(file).size || asset.digest !== digest || asset.state !== 'uploaded')
      throw new Error(`Uploaded asset verification failed: ${asset.name}`);
  }
  gh(['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest']);
  console.log(`Published ${tag} with ${names.length} verified assets.`);
}

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [tag, directory, notes] = process.argv.slice(2);
    if (!tag || !directory || !notes || process.argv.length !== 5)
      throw new Error(
        'Usage: node scripts/publish-release.mjs vX.Y.Z <assets-directory> <notes.md>',
      );
    publishRelease(tag, directory, notes);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
