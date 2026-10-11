import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { platforms, releaseAssets, versionFromTag } from './release-config.mjs';

const escapeMarkdown = (text) => text.replace(/[\\`*_[\]<>]/g, '\\$&');
const isOlder = (candidate, target) => {
  const left = candidate.slice(1).split('.').map(Number);
  const right = target.slice(1).split('.').map(Number);
  const differing = left.findIndex((part, index) => part !== right[index]);
  return differing !== -1 && left[differing] < right[differing];
};
const categoryFor = (subject) => {
  if (/^(feat(?:\([^)]*\))?!?:|add\b|新增|添加|支持)/i.test(subject)) return 'Features';
  if (/^(fix(?:\([^)]*\))?!?:|fix\b|修复)/i.test(subject)) return 'Fixes';
  if (
    /^(?:perf|refactor)(?:\([^)]*\))?!?:|^(?:improve|optimize|simplify|replace)\b|^(?:优化|改进)/i.test(
      subject,
    )
  )
    return 'Improvements';
  if (/^(?:build|ci|chore|docs|test|style)(?:\([^)]*\))?!?:/i.test(subject))
    return 'Build & Maintenance';
  return 'Other Changes';
};

export function generateNotes(tag, { root = process.cwd(), preview = false } = {}) {
  const version = versionFromTag(tag);
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }).trimEnd();
  if (git('rev-parse', '--is-shallow-repository') === 'true') {
    throw new Error('Release notes require complete history and tags.');
  }
  const ref = preview ? 'HEAD' : `refs/tags/${tag}`;
  const sha = git('rev-parse', '--verify', `${ref}^{commit}`);
  const previous = git('tag', '--merged', ref, '--sort=-version:refname')
    .split('\n')
    .find(
      (candidate) =>
        /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(candidate) && isOlder(candidate, tag),
    );
  const fields = git(
    'log',
    '--reverse',
    '--no-merges',
    '-z',
    '--format=%H%x00%s%x00%b',
    previous ? `refs/tags/${previous}..${ref}` : ref,
    '--',
  ).split('\0');
  const groups = new Map(
    ['Features', 'Fixes', 'Improvements', 'Build & Maintenance', 'Other Changes'].map((name) => [
      name,
      [],
    ]),
  );
  let count = 0;
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const [hash, subject, body] = fields.slice(index, index + 3);
    if (/^Release v\d+\.\d+\.\d+$/.test(subject) && !body.trim()) continue;
    groups.get(categoryFor(subject)).push({ hash, subject, body: body.trim() });
    count++;
  }
  const { repository } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const repositoryUrl = process.env.GITHUB_REPOSITORY
    ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}`
    : typeof repository === 'string'
      ? repository
      : repository?.url;
  const url = new URL(repositoryUrl?.replace(/^git\+/, '').replace(/\.git$/, ''));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('An HTTPS repository URL without credentials is required.');
  const repo = url.href.replace(/\/$/, '');
  const linkRef = preview ? sha : tag;
  const date = git('show', '-s', '--format=%cs', sha);
  const lines = [
    "## What's Changed",
    '',
    `${date} · ${previous ? `${previous} → ${tag}` : `${tag} · Initial release`} · ${count} ${count === 1 ? 'commit' : 'commits'}`,
    '',
  ];
  if (preview)
    lines.push(
      'Preview only. Download links become available after the version tag is published.',
      '',
    );
  for (const [name, commits] of groups) {
    if (!commits.length) continue;
    lines.push(`### ${name}`, '');
    for (const { hash, subject, body } of commits) {
      lines.push(`- ${escapeMarkdown(subject)} ([${hash.slice(0, 7)}](${repo}/commit/${hash}))`);
      if (body) lines.push('', ...body.split('\n').map((line) => `  > ${line}`), '');
    }
    lines.push('');
  }
  if (!count) lines.push('No additional changes beyond the version update.', '');
  lines.push(
    previous
      ? `[Full Changelog](${repo}/compare/${previous}...${linkRef})`
      : `[Full Commit History](${repo}/commits/${linkRef})`,
    '',
    '## Install / Run',
    '',
    '| Platform | Download |',
    '| --- | --- |',
  );
  const downloads = `${repo}/releases/download/${tag}`;
  for (const platform of platforms) {
    const links = releaseAssets(version, [platform]).map(
      ({ name, bundle }) =>
        `[${bundle === 'nsis' ? 'Installer' : bundle === 'appimage' ? 'AppImage' : bundle.toUpperCase()}](${downloads}/${name})`,
    );
    lines.push(`| ${platform.label} | ${links.join(' · ')} |`);
  }
  lines.push(
    '',
    `[SHA-256 checksums](${downloads}/SHA256SUMS.txt)`,
    '',
    '### Install and Get Started',
    '',
    '- **Windows:** run the installer for your processor. Windows ARM64 uses a native ARM64 app with an x86 NSIS installer. WebView2 is required; the installer can download it when missing.',
    '- **macOS:** open the DMG and drag JSONL Viewer to Applications. Choose Intel or Apple Silicon to match your Mac. Packages are ad-hoc signed, without Apple notarization; macOS may require approval in System Settings → Privacy & Security.',
    '- **Linux:** install the DEB with your package manager, or make the AppImage executable (`chmod +x JSONL-Viewer_*.AppImage`) and launch it. Builds target Ubuntu 22.04 or compatible newer systems; AppImage may require FUSE 2.',
    '- Open a `.jsonl` or `.ndjson` file from the app, by dropping it into the window, or through its file association.',
    '',
    '### Update an Existing Installation',
    '',
    'Install the package for the same platform and processor over the existing installation. For AppImage, replace the old file. Save open documents and close the app before updating.',
    '',
    '### Verify a Download',
    '',
    'Compare the downloaded file with its entry in `SHA256SUMS.txt`: use `Get-FileHash -Algorithm SHA256 <file>` on Windows, `shasum -a 256 <file>` on macOS, or `sha256sum <file>` on Linux.',
    '',
    `[Build from source and usage](${repo}/blob/${linkRef}/README.md) · [中文说明](${repo}/blob/${linkRef}/README.zh-CN.md)`,
    '',
  );
  if (!preview) lines.push(`<!-- jsonl-viewer-release-commit:${sha} -->`, '');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [tag, output, option] = process.argv.slice(2);
    if (!output || (option && option !== '--preview') || process.argv.length > 5)
      throw new Error(
        'Usage: node scripts/generate-release-notes.mjs vX.Y.Z <output.md> [--preview]',
      );
    writeFileSync(output, generateNotes(tag, { preview: option === '--preview' }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
