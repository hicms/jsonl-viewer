import { chromium, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyExpandedTable, verifyMultipleTableRows } from './table-scroll-native.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.env.JSONL_QA_EXE ?? path.join(root, 'src-tauri/target/debug/JSONL Viewer.exe');
const artifacts = mkdtempSync(path.join(tmpdir(), 'jsonl-large-native-'));
const file = process.env.JSONL_QA_JSON_FILE ?? path.join(artifacts, 'models.json');
if (!process.env.JSONL_QA_JSON_FILE) {
  writeFileSync(
    file,
    JSON.stringify(
      {
        providers: Object.fromEntries(
          Array.from({ length: 433 }, (_, i) => [`provider-${i}`, { name: `provider ${i}` }]),
        ),
        models: Array.from({ length: 2664 }, (_, i) => ({
          id: `model-${i}`,
          prices: Array.from({ length: 80 }, (_, n) => ({
            input: n,
            output: n * 2,
            currency: 'USD',
          })),
        })),
      },
      null,
      2,
    ) + '\n',
  );
}
const original = readFileSync(file, 'utf8');
const digest = (text) => createHash('sha256').update(text).digest('hex');
const rawHash = digest(original);
const port = Number(process.env.JSONL_QA_CDP_PORT ?? 9231);
const started = performance.now();
const child = spawn(exe, [file], {
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding`,
    WEBVIEW2_USER_DATA_FOLDER: path.join(artifacts, 'profile'),
  },
  stdio: 'ignore',
  windowsHide: true,
});
let browser;
const results = {
  artifacts,
  file,
  characters: original.length,
  runtimeErrors: [],
  measurements: {},
};
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
async function measure(name, action) {
  const start = performance.now();
  await action();
  const elapsed = Math.round(performance.now() - start);
  results.measurements[name] = elapsed;
  console.log(`${name}: ${elapsed} ms`);
  expect(elapsed, `${name} should not block for seconds`).toBeLessThan(2000);
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!browser) throw new Error('WebView2 CDP unavailable');
  results.runtime = browser.version();
  const page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => results.runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') results.runtimeErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 840 });
  const opening = page.getByRole('status', { name: /正在读取并解析文件|Reading and parsing file/ });
  await expect(opening).toBeVisible();
  await expect(opening.locator('.astryx-skeleton').first()).toBeVisible();
  await expect(page.locator('.empty-workspace')).toHaveCount(0);
  results.measurements.firstLoadingFeedback = Math.round(performance.now() - started);
  expect(results.measurements.firstLoadingFeedback).toBeLessThan(2000);
  await page.screenshot({ path: path.join(artifacts, 'first-open-loading.png') });
  await expect(page.getByRole('heading', { name: path.basename(file), exact: true })).toBeVisible({
    timeout: 30000,
  });
  expect(page.url()).toContain('tauri.localhost');
  expect(await page.title()).toBe('JSONL Viewer');
  await page.getByRole('combobox', { name: /^(Language|语言)$/ }).click();
  await page.getByRole('option', { name: '简体中文', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  results.measurements.firstDocumentReady = Math.round(performance.now() - started);
  await expect(opening).toHaveCount(0);
  console.log(`First document ready: ${results.measurements.firstDocumentReady} ms`);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  const panel = page.getByRole('complementary', { name: '行详情' });
  const viewport = (scope) => scope.locator('.virtual-code-scroll');
  async function bounded(scope) {
    await expect(viewport(scope)).toBeVisible();
    expect(await scope.locator('[data-code-row]').count()).toBeLessThan(100);
    expect(await page.locator('*').count()).toBeLessThan(2500);
    await expect
      .poll(() => viewport(scope).evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(1);
  }
  async function scrollTail(scope, name) {
    await measure(name, async () => {
      await viewport(scope).evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(scope.locator('[data-code-row]').last()).toContainText(/}|\u200b/);
      await expect
        .poll(() =>
          viewport(scope).evaluate((element) => {
            const last = element.querySelector('[data-code-row]:last-child');
            return (
              !!last &&
              last.getBoundingClientRect().bottom <= element.getBoundingClientRect().bottom + 1
            );
          }),
        )
        .toBe(true);
    });
    await bounded(scope);
  }
  await measure('inspectorOpen', async () => {
    await button(page, '查看第 1 行').click();
    await bounded(panel);
  });
  await scrollTail(panel, 'inspectorScrollTail');
  await measure('inspectorClose', async () => {
    await button(panel, '关闭详情').click();
    await expect(panel).toHaveCount(0);
  });
  await measure('inspectorReopen', async () => {
    await button(page, '查看第 1 行').click();
    await bounded(panel);
  });
  await button(panel, '关闭详情').click();
  const area = page.locator('.view-area');
  await measure('rawOpen', async () => {
    await button(page, '原文').click();
    await bounded(area);
  });
  async function onlyTextScrolls() {
    await expect
      .poll(() =>
        area.evaluate((element) =>
          [element, ...element.querySelectorAll('*')]
            .filter(
              (node) =>
                /auto|scroll/.test(getComputedStyle(node).overflowY) &&
                node.scrollHeight > node.clientHeight + 1,
            )
            .map((node) => node.classList.contains('virtual-code-scroll')),
        ),
      )
      .toEqual([true]);
    expect(
      await area.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
  }
  await onlyTextScrolls();
  await scrollTail(area, 'rawScrollTail');
  const lastRow = Number(
    await area.locator('[data-code-row]').last().getAttribute('data-code-row'),
  );
  expect(lastRow).toBeGreaterThan(1_000_000);
  // Wheel, keyboard and thumb dragging all use the native scroll container.
  await viewport(area).evaluate((element) => {
    element.scrollTop = 0;
  });
  await viewport(area).focus();
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => viewport(area).evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const box = await viewport(area).boundingBox();
  await viewport(area).evaluate((element) => {
    element.scrollTop = 0;
  });
  await measure('rawScrollbarDrag', async () => {
    await page.mouse.move(box.x + box.width - 7, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 7, box.y + box.height - 24, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(() => viewport(area).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(1000000);
  });
  await button(area, '复制原文').click();
  await expect
    .poll(
      () =>
        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-STA',
            '-Command',
            'Add-Type -AssemblyName System.Windows.Forms; $text = [Windows.Forms.Clipboard]::GetText().Replace([string][char]13 + [char]10, [string][char]10); $hash = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($text)); ([BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()',
          ],
          { encoding: 'utf8', windowsHide: true },
        ).trim(),
      { timeout: 10000 },
    )
    .toBe(digest(original.replaceAll('\r\n', '\n')));
  results.completeRawCopy = true;
  for (const zoom of [80, 150, 100]) {
    await page.setViewportSize({ width: 1280, height: 840 });
    await page.getByRole('button', { name: /^\d+%$/ }).click();
    for (let i = 0; i < Math.abs(zoom - 100) / 10; i++) {
      await button(page, zoom > 100 ? '放大' : '缩小').click();
    }
    for (const [width, height] of [
      [720, 480],
      [1280, 840],
    ]) {
      await page.setViewportSize({ width, height });
      await onlyTextScrolls();
      await bounded(area);
      for (const fraction of [0.15, 0.5, 0.85, 1]) {
        await viewport(area).evaluate((element, fraction) => {
          element.scrollTop = fraction * element.scrollHeight;
        }, fraction);
        await bounded(area);
      }
    }
  }
  await viewport(area).evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(area.locator('[data-code-row]').first()).toHaveAttribute('data-code-row', '0');
  await page.screenshot({ path: path.join(artifacts, 'raw-single-scrollbar.png') });
  results.rawSingleScrollbar = true;
  await button(area, '第 1 行').click();
  await bounded(panel);
  await button(panel, '原文').click();
  await bounded(panel);
  await button(panel, 'JSON').click();
  await bounded(panel);
  await button(panel, '关闭详情').click();
  await button(page, '表格').click();
  await measure('tableExpand', async () => {
    await page.getByRole('button', { name: /展开行|Expand row/ }).click();
    await expect(area.locator('.virtual-code-flow')).toBeVisible();
    expect(await area.locator('[data-code-row]').count()).toBeLessThan(100);
  });
  await verifyExpandedTable(page, artifacts);
  results.tableScrollLayout = true;
  await page.screenshot({ path: path.join(artifacts, 'table-expanded.png') });
  await measure('tableCollapse', async () => {
    await page.getByRole('button', { name: /折叠行|Collapse row/ }).click();
    await expect(area.locator('.virtual-code-flow')).toHaveCount(0);
  });
  await button(page, '查看第 1 行').click();
  for (const width of [720, 1280]) {
    await page.setViewportSize({ width, height: 840 });
    await bounded(panel);
    const header = await button(panel, '关闭详情').boundingBox();
    expect(header.x + header.width).toBeLessThanOrEqual(width);
    await scrollTail(panel, `inspectorTailWidth${width}`);
  }
  await viewport(panel).evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(panel.locator('[data-code-row]').first()).toHaveAttribute('data-code-row', '0');
  await page.screenshot({ path: path.join(artifacts, 'inspector.png') });
  await button(panel, '关闭详情').click();
  const wrappedFile = path.join(artifacts, 'wrapped-lines.json');
  writeFileSync(
    wrappedFile,
    JSON.stringify({ text: '中文😀 / URL-'.repeat(12000), tail: '完整末尾' }),
  );
  execFileSync(exe, [wrappedFile], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
  await expect(
    page.getByRole('heading', { name: 'wrapped-lines.json', exact: true }),
  ).toBeVisible();
  await button(page, '原文').click();
  for (const width of [720, 1280]) {
    await page.setViewportSize({ width, height: 840 });
    await bounded(area);
    await onlyTextScrolls();
    await viewport(area).evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(area.locator('[data-code-row]').last()).toContainText('完整末尾');
    await bounded(area);
  }
  await page.setViewportSize({ width: 720, height: 840 });
  await viewport(area).evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: path.join(artifacts, 'wrapped-long-lines.png') });
  results.longUnicodeLinesWrap = true;
  await verifyMultipleTableRows(page, artifacts, async (file) => {
    execFileSync(exe, [file], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
  });
  results.multipleTableRowsReachable = true;
  expect(digest(readFileSync(file, 'utf8'))).toBe(rawHash);
  expect(results.runtimeErrors).toEqual([]);
  results.sourceUnchanged = true;
  results.passed = true;
} catch (error) {
  results.error = error.stack;
  if (browser)
    await browser
      .contexts()[0]
      .pages()[0]
      .screenshot({ path: path.join(artifacts, 'failure.png'), timeout: 5000 })
      .catch(() => {});
  throw error;
} finally {
  writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (child.pid && child.exitCode === null)
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  if (browser) await browser.close().catch(() => {});
}
