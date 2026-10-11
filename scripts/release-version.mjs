import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stableVersion, versionFromTag } from './release-config.mjs';

export const versionFiles = [
  'package.json',
  'package-lock.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
];
const cargoPackage = /(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m;
const cargoLockPackage = /(\[\[package\]\]\r?\nname = "jsonl-viewer"\r?\nversion = ")([^"]+)(")/;

function manifests(root) {
  return versionFiles.map((file) => ({ file, text: readFileSync(join(root, file), 'utf8') }));
}

export function readVersion(root = process.cwd()) {
  const [pkg, lock, tauri, cargo, cargoLock] = manifests(root);
  const packageJson = JSON.parse(pkg.text);
  const lockJson = JSON.parse(lock.text);
  const versions = [
    packageJson.version,
    lockJson.version,
    lockJson.packages[''].version,
    JSON.parse(tauri.text).version,
    cargo.text.match(cargoPackage)?.[2],
    cargoLock.text.match(cargoLockPackage)?.[2],
  ];
  if (!stableVersion.test(versions[0]) || versions.some((version) => version !== versions[0])) {
    throw new Error(
      'Package, Tauri, Cargo and lockfile versions must match a stable X.Y.Z version.',
    );
  }
  return versions[0];
}

export function bumpVersion(next, root = process.cwd()) {
  const current = readVersion(root);
  if (!stableVersion.test(next)) throw new Error('Expected version X.Y.Z.');
  const parts = next.split('.').map(Number);
  const previous = current.split('.').map(Number);
  const differing = parts.findIndex((part, index) => part !== previous[index]);
  if (differing !== -1 && parts[differing] < previous[differing])
    throw new Error('Version cannot go backwards.');
  if (current === next) return next;
  const updates = manifests(root).map(({ file, text }) => {
    if (file === 'src-tauri/Cargo.toml')
      return { file, text: text.replace(cargoPackage, (_, start, old, end) => start + next + end) };
    if (file === 'src-tauri/Cargo.lock')
      return {
        file,
        text: text.replace(cargoLockPackage, (_, start, old, end) => start + next + end),
      };
    const json = JSON.parse(text);
    json.version = next;
    if (file === 'package-lock.json') json.packages[''].version = next;
    if (file === 'src-tauri/tauri.conf.json')
      return {
        file,
        text: text.replace(
          /("version"\s*:\s*")[^"]+("\s*,)/,
          (_, start, end) => start + next + end,
        ),
      };
    return { file, text: JSON.stringify(json, null, 2) + '\n' };
  });
  for (const update of updates) writeFileSync(join(root, update.file), update.text);
  return next;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, argument] = process.argv.slice(2);
    if (command === 'files') {
      console.log(versionFiles.join('\n'));
    } else if (command === 'check') {
      const version = readVersion();
      if (argument && versionFromTag(argument) !== version)
        throw new Error(`Tag ${argument} does not match project version ${version}.`);
      console.log(version);
    } else if (command === 'bump') console.log(bumpVersion(argument));
    else throw new Error('Usage: node scripts/release-version.mjs check [vX.Y.Z] | bump X.Y.Z');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
