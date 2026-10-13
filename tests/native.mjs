import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyViews,
  verifyJsonlSave,
  verifyJsonDocument,
  verifySession,
} from './native-flows.mjs';
import { verifyTitlebar } from './titlebar-native.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { mainBinaryName } = JSON.parse(
  readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'),
);
const exe =
  process.env.JSONL_QA_EXE ?? path.join(root, 'src-tauri/target/debug', `${mainBinaryName}.exe`);
if (!existsSync(exe)) throw new Error('First run: npm run tauri -- build --debug --no-bundle');
const temporaryRoot = realpathSync.native(tmpdir());
const directory = mkdtempSync(path.join(temporaryRoot, 'jsonl-viewer-native-'));
const artifacts =
  process.env.JSONL_QA_ARTIFACT_DIR ??
  mkdtempSync(path.join(temporaryRoot, 'jsonl-native-evidence-'));
mkdirSync(artifacts, { recursive: true });
const logs = path.join(directory, 'logs.jsonl');
copyFileSync(path.join(root, 'tests/fixtures/logs.jsonl'), logs);
const port = Number(process.env.JSONL_QA_CDP_PORT ?? 9224);
const processHandle = spawn(exe, [logs], {
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: [
      `--remote-debugging-port=${port}`,
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ].join(' '),
    WEBVIEW2_USER_DATA_FOLDER: path.join(directory, 'profile'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
const startupLog = path.join(artifacts, 'native-startup.log');
writeFileSync(startupLog, `Executable: ${exe}\nNode architecture: ${process.arch}\n`);
for (const output of [processHandle.stdout, processHandle.stderr])
  output.on('data', (chunk) => appendFileSync(startupLog, chunk));
let startupError;
processHandle.once('error', (error) => {
  startupError = error;
  appendFileSync(startupLog, `${error.stack}\n`);
});
processHandle.once('exit', (code, signal) => {
  appendFileSync(startupLog, `Process exit: ${code ?? signal}\n`);
});
let browser;
const started = Date.now();
const checks = [];
const errors = [];
async function check(name, run) {
  const start = Date.now();
  console.log(`Checking: ${name}`);
  await run();
  expect(errors).toEqual([]);
  checks.push({ name, milliseconds: Date.now() - start });
}
async function openFile(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(exe, [file], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`Open file process exited: ${code ?? signal}`)),
    );
  });
}
try {
  for (let n = 0; n < 80; n++) {
    if (startupError) throw startupError;
    if (processHandle.exitCode !== null || processHandle.signalCode !== null)
      throw new Error(
        `Desktop exited before WebView2 connected: ${processHandle.exitCode ?? processHandle.signalCode}`,
      );
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!browser) throw new Error('WebView2 did not expose the test CDP endpoint');
  appendFileSync(startupLog, `WebView2 version: ${browser.version()}\n`);
  console.log(`Connected to WebView2 ${browser.version()}`);
  const page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 840 });
  await expect(page.getByRole('heading', { name: 'logs.jsonl', exact: true })).toBeVisible();
  expect(page.url()).toContain('tauri.localhost');
  const expectedLanguage = await page.evaluate(() =>
    /^zh(?:-|$)/i.test(navigator.languages[0] ?? navigator.language) ? 'zh-CN' : 'en',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', expectedLanguage);
  await page.getByRole('combobox', { name: /^(Language|语言)$/ }).click();
  await page.getByRole('option', { name: '简体中文', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  const context = { page, directory, root, openFile, processId: processHandle.pid };
  await check('startup, search and table/tree/raw views', () => verifyViews(context));
  await check('native window controls and narrow navigation drawer', () => verifyTitlebar(context));
  await check('JSONL paging, draft close protection and complete-file save', () =>
    verifyJsonlSave(context),
  );
  await check('JSON complete-document save and reopen', () => verifyJsonDocument(context));
  await check('single-instance session open and live file append', () => verifySession(context));
  await page.screenshot({ path: path.join(artifacts, 'native-passed.png') });
  const result = {
    passed: checks,
    milliseconds: Date.now() - started,
    runtimeErrors: errors,
    artifacts,
  };
  writeFileSync(path.join(artifacts, 'native-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  writeFileSync(
    path.join(artifacts, 'native-failure.log'),
    `${error.stack}\nRuntime errors: ${JSON.stringify(errors)}`,
  );
  console.error(`Native test evidence: ${artifacts}`);
  if (browser)
    await browser
      .contexts()[0]
      .pages()[0]
      .screenshot({ path: path.join(artifacts, 'native-failure.png') })
      .catch(() => {});
  throw error;
} finally {
  if (processHandle.pid && processHandle.exitCode === null && processHandle.signalCode === null)
    execFileSync('taskkill', ['/PID', String(processHandle.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  if (browser) await browser.close();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const resolved = path.resolve(directory);
  if (
    !resolved.startsWith(path.resolve(temporaryRoot) + path.sep) ||
    !path.basename(resolved).startsWith('jsonl-viewer-native-')
  )
    throw new Error('Unexpected cleanup target');
  rmSync(resolved, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 });
}
