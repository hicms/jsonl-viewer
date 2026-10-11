import { pathToFileURL } from 'node:url';

export const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export const platforms = [
  {
    id: 'linux-x64',
    label: 'Linux x64',
    runner: 'ubuntu-22.04',
    target: 'x86_64-unknown-linux-gnu',
    bundles: ['deb', 'appimage'],
  },
  {
    id: 'linux-arm64',
    label: 'Linux ARM64',
    runner: 'ubuntu-22.04-arm',
    target: 'aarch64-unknown-linux-gnu',
    bundles: ['deb', 'appimage'],
  },
  {
    id: 'macos-x64',
    label: 'macOS Intel',
    runner: 'macos-15-intel',
    target: 'x86_64-apple-darwin',
    bundles: ['dmg'],
  },
  {
    id: 'macos-arm64',
    label: 'macOS Apple Silicon',
    runner: 'macos-15',
    target: 'aarch64-apple-darwin',
    bundles: ['dmg'],
  },
  {
    id: 'windows-x64',
    label: 'Windows x64',
    runner: 'windows-2022',
    target: 'x86_64-pc-windows-msvc',
    bundles: ['nsis'],
  },
  {
    id: 'windows-arm64',
    label: 'Windows ARM64',
    runner: 'windows-11-arm',
    target: 'aarch64-pc-windows-msvc',
    bundles: ['nsis'],
  },
];

export function versionFromTag(tag) {
  if (!tag?.startsWith('v') || !stableVersion.test(tag.slice(1))) {
    throw new Error('Expected a stable version tag vX.Y.Z.');
  }
  return tag.slice(1);
}

export function releaseAssets(version, selected = platforms) {
  if (!stableVersion.test(version)) throw new Error('Expected version X.Y.Z.');
  return selected.flatMap((platform) =>
    platform.bundles.map((bundle) => ({
      platform: platform.id,
      bundle,
      extension: { nsis: '.exe', dmg: '.dmg', deb: '.deb', appimage: '.AppImage' }[bundle],
      name: `JSONL-Viewer_${version}_${platform.id}${bundle === 'nsis' ? '-setup.exe' : bundle === 'appimage' ? '.AppImage' : `.${bundle}`}`,
    })),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'matrix') console.log(JSON.stringify({ include: platforms }));
    else if (process.argv[2] === 'assets') {
      console.log(
        [
          ...releaseAssets(versionFromTag(process.argv[3])).map((a) => a.name),
          'SHA256SUMS.txt',
        ].join('\n'),
      );
    } else throw new Error('Usage: node scripts/release-config.mjs matrix | assets vX.Y.Z');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
