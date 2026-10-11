import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { platforms, releaseAssets } from './release-config.mjs';
import { readVersion } from './release-version.mjs';

export function packageAssets(platformId, destination, root = process.cwd()) {
  const platform = platforms.find((item) => item.id === platformId);
  if (!platform) throw new Error(`Unknown platform: ${platformId}`);
  const assets = releaseAssets(readVersion(root), [platform]);
  const sources = assets.map((asset) => {
    const directory = join(
      root,
      'src-tauri/target',
      platform.target,
      'release/bundle',
      asset.bundle,
    );
    const matches = readdirSync(directory).filter((name) => name.endsWith(asset.extension));
    if (matches.length !== 1)
      throw new Error(`Expected exactly one ${asset.bundle} installer in ${directory}.`);
    const source = join(directory, matches[0]);
    if (!statSync(source).isFile() || statSync(source).size === 0)
      throw new Error(`Empty or invalid installer: ${source}`);
    return { source, name: asset.name };
  });
  mkdirSync(destination, { recursive: true });
  for (const { source, name } of sources) copyFileSync(source, join(destination, name));
  return sources.map((source) => source.name);
}

export function collectAssets(directory, root = process.cwd()) {
  const expected = releaseAssets(readVersion(root))
    .map((asset) => asset.name)
    .sort();
  const actual = readdirSync(directory)
    .filter((name) => name !== 'SHA256SUMS.txt')
    .sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(
      `Release assets do not match all six platforms. Expected: ${expected.join(', ')}; found: ${actual.join(', ')}`,
    );
  }
  const checksums = expected.map((name) => {
    const file = join(directory, name);
    if (!statSync(file).isFile() || statSync(file).size === 0)
      throw new Error(`Empty or invalid installer: ${name}`);
    return `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${name}`;
  });
  writeFileSync(join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
  return [...expected, 'SHA256SUMS.txt'];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, argument, directory] = process.argv.slice(2);
    if (command === 'package' && directory)
      console.log(packageAssets(argument, directory).join('\n'));
    else if (command === 'collect' && argument) console.log(collectAssets(argument).join('\n'));
    else
      throw new Error(
        'Usage: node scripts/release-assets.mjs package <platform> <directory> | collect <directory>',
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
