import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'jsonl-release-'));
  const root = join(directory, 'source');
  const remote = join(directory, 'origin.git');
  const put = (name, text) => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  put(
    'package.json',
    JSON.stringify(
      {
        name: 'jsonl-viewer',
        version: '2.0.0',
        type: 'module',
        repository: 'https://github.com/example/viewer',
      },
      null,
      2,
    ) + '\n',
  );
  put(
    'package-lock.json',
    JSON.stringify(
      {
        name: 'jsonl-viewer',
        version: '2.0.0',
        lockfileVersion: 3,
        packages: {
          '': { name: 'jsonl-viewer', version: '2.0.0' },
          'node_modules/dependency': { version: '2.0.0' },
        },
      },
      null,
      2,
    ) + '\n',
  );
  put('src-tauri/tauri.conf.json', '{"version":"2.0.0","productName":"JSONL Viewer"}\n');
  put(
    'src-tauri/Cargo.toml',
    '[package]\nname = "jsonl-viewer"\nversion = "2.0.0"\n\n[dependencies]\ndependency = "2.0.0"\n',
  );
  put(
    'src-tauri/Cargo.lock',
    'version = 4\n\n[[package]]\nname = "dependency"\nversion = "2.0.0"\n\n[[package]]\nname = "jsonl-viewer"\nversion = "2.0.0"\n',
  );
  mkdirSync(join(root, 'scripts'));
  for (const script of ['release.ps1', 'release-version.mjs', 'release-config.mjs'])
    copyFileSync(resolve('scripts', script), join(root, 'scripts', script));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return result.stdout.trim();
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', join(directory, 'no-hooks'));
  git('add', '.');
  git('commit', '-m', 'feat: initial viewer');
  git('tag', 'v2.0.0');
  git('init', '--bare', remote);
  git('remote', 'add', 'origin', remote);
  git('push', 'origin', 'main', 'refs/tags/v2.0.0');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { root, remote, directory, put, git };
}
