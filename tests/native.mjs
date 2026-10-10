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
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyInspector } from './inspector-native.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = process.env.JSONL_QA_EXE ?? path.join(root, 'src-tauri/target/debug/jsonl-viewer.exe');
if (!existsSync(exe)) throw new Error('First run: npm run tauri -- build --debug --no-bundle');
const directory = mkdtempSync(path.join(tmpdir(), 'jsonl-viewer-native-'));
const artifacts = process.env.JSONL_QA_ARTIFACT_DIR ?? directory;
mkdirSync(artifacts, { recursive: true });
const logs = path.join(directory, 'logs.jsonl');
const session = path.join(directory, 'session.jsonl');
const child = path.join(directory, 'child.jsonl');
const large = path.join(directory, 'large.jsonl');
const agent = path.join(directory, 'agent.jsonl');
copyFileSync(path.join(root, 'tests/fixtures/logs.jsonl'), logs);
copyFileSync(path.join(root, 'tests/fixtures/session.jsonl'), session);
writeFileSync(
  child,
  JSON.stringify({
    type: 'session_meta',
    payload: {
      id: 'session-child',
      thread_source: 'subagent',
      parent_thread_id: 'session-demo',
      agent_role: 'explorer',
    },
  }) +
    '\n' +
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: '子会话完成' }],
      },
    }) +
    '\n',
);
writeFileSync(
  large,
  Array.from({ length: 6001 }, (_, n) => JSON.stringify({ id: n, message: `record-${n}` })).join(
    '\n',
  ) + '\n',
);
writeFileSync(
  agent,
  Array.from({ length: 120 }, (_, index) =>
    JSON.stringify({
      type: 'assistant',
      uuid: `message-${index}`,
      sessionId: 'performance-session',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: `Record ${index}: ${'long agent output '.repeat(300)}` }],
      },
      ...Object.fromEntries(
        Array.from({ length: 24 }, (_, key) => [`field-${key}`, `value-${key}`]),
      ),
    }),
  ).join('\n') + '\n',
);
const port = Number(process.env.JSONL_QA_CDP_PORT ?? 9224);
const processHandle = spawn(exe, [logs], {
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    WEBVIEW2_USER_DATA_FOLDER: path.join(directory, 'profile'),
  },
  stdio: 'ignore',
  windowsHide: true,
});
let browser;
const checks = [];
try {
  for (let n = 0; n < 80; n++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!browser) throw new Error('WebView2 did not expose the test CDP endpoint');
  const page = browser.contexts()[0].pages()[0];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'logs.jsonl', exact: true })).toBeVisible();
  expect(await page.title()).toBe('JSONL Viewer');
  expect(page.url()).toContain('tauri.localhost');
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('heading', { name: 'logs.jsonl', exact: true }).click();
  await expect(
    page
      .getByRole('navigation', { name: '打开的文件' })
      .getByRole('button', { name: '关闭 logs.jsonl', exact: true }),
  ).toHaveCSS('opacity', '1');
  await expect(
    page
      .getByRole('navigation', { name: '文件浏览器' })
      .getByRole('button', { name: '关闭 logs.jsonl', exact: true }),
  ).toHaveCSS('opacity', '1');
  expect(
    Number(
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-File',
          path.join(root, 'tests/native-menu.ps1'),
          '-ViewerProcessId',
          String(processHandle.pid),
        ],
        { encoding: 'utf8', windowsHide: true },
      ).trim(),
    ),
  ).toBe(0);
  checks.push('native startup argument opens table with real Rust IO');
  await page.getByRole('combobox', { name: '主题模式' }).click();
  await page.getByRole('option', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: path.join(artifacts, 'native-dark.png') });
  await page.getByRole('combobox', { name: '主题模式' }).click();
  await page.getByRole('option', { name: '浅色', exact: true }).click();
  checks.push('Astryx theme Selector and dark mode');
  await page.screenshot({ path: path.join(artifacts, 'native-table.png') });
  await page.getByRole('textbox', { name: '搜索已加载内容' }).fill('内存使用');
  await expect(page.getByRole('table').getByText('内存使用情况')).toBeVisible();
  expect(await page.getByRole('table').getByText('服务已启动').count()).toBe(0);
  await page.getByRole('textbox', { name: '搜索已加载内容' }).fill('');
  await page.getByRole('button', { name: '树形', exact: true }).click();
  await expect(page.getByRole('tree', { name: 'JSON 树' })).toBeVisible();
  await page.getByRole('button', { name: '展开全部', exact: true }).click();
  await expect(page.getByRole('tree').getByText('port: 3000', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '原文', exact: true }).click();
  await expect(page.getByRole('button', { name: '第 1 行', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '表格', exact: true }).click();
  checks.push('filter, nested tree expand and raw view');
  await page.getByRole('button', { name: '查看第 1 行', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '行详情' })).toBeVisible();
  await page
    .getByRole('complementary', { name: '行详情' })
    .getByRole('button', { name: '编辑', exact: true })
    .click();
  const input = page.getByRole('textbox', { name: '编辑 JSON' });
  const first = JSON.parse(readFileSync(logs, 'utf8').split('\n')[0]);
  await input.fill(JSON.stringify({ ...first, message: '真实保存测试' }));
  await page
    .locator('.file-tab')
    .filter({ has: page.getByRole('button', { name: '关闭 logs.jsonl', exact: true }) })
    .hover();
  await page
    .getByRole('navigation', { name: '打开的文件' })
    .getByRole('button', { name: '关闭 logs.jsonl', exact: true })
    .click();
  await expect(page.getByText('放弃未保存的修改？', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  await page
    .getByRole('complementary', { name: '行详情' })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(page.getByText('已保存完整文件', { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-astryx-toast-fallback]')).toHaveCount(0);
  const savedToast = page.locator('.astryx-toast').filter({ hasText: '已保存完整文件' }).last();
  await expect
    .poll(async () =>
      savedToast.evaluate((element) =>
        Math.round(window.innerHeight - element.getBoundingClientRect().bottom),
      ),
    )
    .toBe(80);
  await page.screenshot({ path: path.join(artifacts, 'native-toast-raised.png') });
  expect(JSON.parse(readFileSync(logs, 'utf8').split('\n')[0]).message).toBe('真实保存测试');
  checks.push('immediate dirty draft, Astryx close confirmation, real Rust atomic save');
  await page
    .getByRole('complementary', { name: '行详情' })
    .getByRole('button', { name: '编辑中', exact: true })
    .click();
  await page.getByRole('button', { name: '关闭详情', exact: true }).click();
  const second = spawn(exe, [session], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => second.once('exit', resolve));
  await expect(page.getByRole('heading', { name: 'session.jsonl', exact: true })).toBeVisible();
  await expect(page.getByText('Codex 会话', { exact: true })).toBeVisible();
  await expect(
    page.getByText('帮我检查数据文件，确认每一行都是有效 JSON。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '最新在前', exact: true }).hover();
  await expect(page.getByRole('tooltip')).toContainText('当前从旧到新，点击让最新在前');
  await page.getByRole('button', { name: '最新在前', exact: true }).click();
  await page.getByRole('button', { name: '折叠详情', exact: true }).click();
  await expect(page.getByRole('button', { name: '从旧到新', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '展开详情', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '宽屏', exact: true }).click();
  await expect(page.locator('.trace-wide')).toBeVisible();
  await page.getByRole('button', { name: '紧凑', exact: true }).click();
  await expect(page.locator('.trace-compact')).toBeVisible();
  for (const width of [1280, 720]) {
    await page.setViewportSize({ width, height: 840 });
    await expect
      .poll(async () => (await page.locator('.file-toolbar').boundingBox()).height)
      .toBeLessThanOrEqual(72);
    const toolbarBox = await page.locator('.file-toolbar').boundingBox();
    expect(toolbarBox.height).toBeLessThanOrEqual(72);
    for (const label of ['从旧到新', '展开详情', '宽屏']) {
      const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y).toBeGreaterThanOrEqual(toolbarBox.y);
      expect(box.y + box.height).toBeLessThanOrEqual(toolbarBox.y + toolbarBox.height);
    }
    await page.screenshot({ path: path.join(artifacts, `native-compact-toolbar-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 840 });
  checks.push(
    'native menu hidden; three session icon controls share one toolbar row at 1280 and 720',
  );
  appendFileSync(
    session,
    '\n' +
      JSON.stringify({
        type: 'event_msg',
        payload: { type: 'agent_message', message: '实时追加已到达' },
      }) +
      '\n',
  );
  await expect(page.getByText('实时追加已到达', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: path.join(artifacts, 'native-trace.png') });
  checks.push('single-instance second file open, trace order/disclosure, real disk live append');
  await page
    .locator('.file-tab')
    .filter({ has: page.getByRole('button', { name: '关闭 session.jsonl', exact: true }) })
    .hover();
  await page
    .getByRole('navigation', { name: '打开的文件' })
    .getByRole('button', { name: '关闭 session.jsonl', exact: true })
    .click();
  const childProcess = spawn(exe, [child], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => childProcess.once('exit', resolve));
  await expect(page.getByRole('heading', { name: 'child.jsonl', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '父会话 session-demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'session.jsonl', exact: true })).toBeVisible();
  checks.push('unopened Codex parent session resolves from sibling metadata');
  const third = spawn(exe, [large], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => third.once('exit', resolve));
  await expect(page.getByRole('heading', { name: 'large.jsonl', exact: true })).toBeVisible();
  await expect(page.getByText(/已加载 1,000 条/)).toBeVisible();
  await page.getByRole('button', { name: '加载更多', exact: true }).click();
  await expect(page.getByText(/已加载 2,000 条/)).toBeVisible();
  await page.getByRole('button', { name: '查看第 1 行', exact: true }).click();
  await page
    .getByRole('complementary', { name: '行详情' })
    .getByRole('button', { name: '编辑', exact: true })
    .click();
  await page.getByRole('textbox', { name: '编辑 JSON' }).fill('{"id":0,"message":"edited-large"}');
  await page
    .getByRole('complementary', { name: '行详情' })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect(page.getByText('已保存完整文件', { exact: true }).first()).toBeVisible();
  const written = readFileSync(large, 'utf8').trim().split('\n');
  expect(written).toHaveLength(6001);
  expect(JSON.parse(written.at(-1)).id).toBe(6000);
  checks.push('6001-line file paging and partial-load save retains entire original');
  await page.setViewportSize({ width: 720, height: 600 });
  await expect(page.getByRole('button', { name: '放大', exact: true })).toBeVisible();
  const footer = await page.locator('.status-bar').boundingBox();
  expect(footer.y + footer.height).toBeLessThanOrEqual(601);
  await page.screenshot({ path: path.join(artifacts, 'native-minimum.png') });
  checks.push('720px minimum desktop viewport keeps controls and footer visible');
  await page.setViewportSize({ width: 1280, height: 840 });
  const agentProcess = spawn(exe, [agent], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => agentProcess.once('exit', resolve));
  await expect(page.getByRole('heading', { name: 'agent.jsonl', exact: true })).toBeVisible();
  await expect(page.getByText('Claude Code 会话', { exact: true })).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    window.__loadingFrames = [];
    const sample = () => {
      const status = document.querySelector('.view-area [role="status"]');
      if (status?.querySelector('.astryx-skeleton'))
        window.__loadingFrames.push(status.getAttribute('aria-label'));
      window.__loadingSampler = requestAnimationFrame(sample);
    };
    window.__loadingSampler = requestAnimationFrame(sample);
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 10 });
  await page.getByRole('button', { name: '表格', exact: true }).click();
  await expect(page.getByRole('status', { name: '正在加载表格' })).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, 'native-skeleton.png') });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => window.__loadingFrames)).toContain('正在加载表格');
  expect(await page.getByRole('table').innerText()).not.toContain('long agent output '.repeat(300));
  await page.getByRole('button', { name: '树形', exact: true }).click();
  await expect(page.getByRole('tree', { name: 'JSON 树' })).toBeVisible();
  const switchStart = Date.now();
  await page.getByRole('button', { name: '表格', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(Date.now() - switchStart).toBeLessThan(2000);
  for (const name of ['树形', '表格', '原文', '树形'])
    await page.getByRole('button', { name, exact: true }).dispatchEvent('click');
  await expect(page.getByRole('tree', { name: 'JSON 树' })).toBeVisible();
  expect(await page.getByRole('table').count()).toBe(0);
  await page.evaluate(() => cancelAnimationFrame(window.__loadingSampler));
  checks.push(
    'wide Agent table stays responsive, official Skeleton paints, latest rapid switch wins',
  );
  const tabs = page.getByRole('navigation', { name: '打开的文件' });
  const logsTab = tabs
    .locator('.file-tab')
    .filter({ has: page.getByRole('button', { name: '关闭 logs.jsonl', exact: true }) });
  const logsClose = logsTab.getByRole('button', { name: '关闭 logs.jsonl', exact: true });
  async function pressCloseWithoutFrame(button) {
    await button.hover();
    await expect(button).toHaveCSS('background-image', 'none');
    await page.mouse.down();
    await expect(button).toHaveCSS('background-image', 'none');
    await expect(button).toHaveCSS('outline-width', '0px');
    await expect(button).toHaveCSS('border-top-width', '0px');
    await page.screenshot({ path: path.join(artifacts, 'native-close-pressed.png') });
    await page.mouse.up();
  }
  await page.getByRole('heading', { name: 'agent.jsonl', exact: true }).click();
  await expect(logsClose).toHaveCSS('opacity', '0');
  await logsTab.hover();
  await expect(logsClose).toHaveCSS('opacity', '1');
  const tabBox = await logsTab.locator('[data-tab-value]').boundingBox();
  const actionBox = await logsClose.boundingBox();
  expect(actionBox.x).toBeGreaterThanOrEqual(tabBox.x);
  expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(tabBox.x + tabBox.width);
  await pressCloseWithoutFrame(logsClose);
  await expect(tabs.getByRole('button', { name: '关闭 logs.jsonl', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'agent.jsonl', exact: true })).toBeVisible();
  const childTab = tabs
    .locator('.file-tab')
    .filter({ has: page.getByRole('button', { name: '关闭 child.jsonl', exact: true }) });
  await page.mouse.move(1100, 750);
  await childTab.locator('[data-tab-value]').focus();
  await expect(childTab.getByRole('button', { name: '关闭 child.jsonl', exact: true })).toHaveCSS(
    'opacity',
    '1',
  );
  await page.keyboard.press('Tab');
  await expect(
    childTab.getByRole('button', { name: '关闭 child.jsonl', exact: true }),
  ).toBeFocused();
  await expect(childTab.getByRole('button', { name: '关闭 child.jsonl', exact: true })).toHaveCSS(
    'outline-style',
    'solid',
  );
  expect(
    await childTab
      .getByRole('button', { name: '关闭 child.jsonl', exact: true })
      .evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth)),
  ).toBeGreaterThan(0);
  await page.keyboard.press('Enter');
  await expect(childTab).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'agent.jsonl', exact: true })).toBeVisible();
  const sidebar = page.getByRole('navigation', { name: '文件浏览器', exact: true });
  const sidebarSession = sidebar
    .locator('.file-item')
    .filter({ has: page.getByRole('button', { name: '关闭 session.jsonl', exact: true }) });
  await sidebarSession.hover();
  await pressCloseWithoutFrame(
    sidebarSession.getByRole('button', { name: '关闭 session.jsonl', exact: true }),
  );
  await expect(tabs.getByRole('button', { name: '关闭 session.jsonl', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { name: 'agent.jsonl', exact: true })).toBeVisible();
  checks.push(
    'per-file hover and keyboard close targets background file; sidebar closes same document',
  );

  const historyPaths = Array.from({ length: 50 }, (_, index) => {
    const file = path.join(directory, `history-${index}.jsonl`);
    writeFileSync(file, '{"value":1}\n');
    return path.toNamespacedPath(file);
  });
  await page.evaluate(
    (paths) => localStorage.setItem('jsonl-viewer:2:recent', JSON.stringify(paths)),
    historyPaths,
  );
  await page.reload();
  const recent = page.getByRole('region', { name: '最近文件' });
  await expect(recent.getByRole('button', { name: /^history-\d+\.jsonl$/ })).toHaveCount(5);
  await recent.getByRole('button', { name: /显示更多/ }).click();
  await expect(recent.getByRole('button', { name: /^history-\d+\.jsonl$/ })).toHaveCount(50);
  await recent.getByRole('button', { name: '收起', exact: true }).click();
  await expect(recent.getByRole('button', { name: /^history-\d+\.jsonl$/ })).toHaveCount(5);
  await recent.getByRole('button', { name: /显示更多/ }).click();
  for (const index of [0, 1, 2, 3, 4, 5]) {
    await recent.getByRole('button', { name: `history-${index}.jsonl`, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: `history-${index}.jsonl`, exact: true }),
    ).toBeVisible();
  }
  await tabs.locator('.file-tab').first().hover();
  await page.screenshot({ path: path.join(artifacts, 'native-recent-files.png') });
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('jsonl-viewer:2:recent')).length),
  ).toBe(50);
  await page.setViewportSize({ width: 720, height: 600 });
  const lastTab = tabs.locator('[data-tab-value]').last();
  await lastTab.focus();
  await page.keyboard.press('Home');
  await expect(tabs.locator('[data-tab-value]').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(lastTab).toBeFocused();
  await page.keyboard.press('Tab');
  const lastClose = tabs.getByRole('button', { name: '关闭 history-5.jsonl', exact: true });
  await expect(lastClose).toBeFocused();
  const closeBox = await lastClose.boundingBox();
  expect(closeBox.x).toBeGreaterThanOrEqual(0);
  expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(720);
  await page.screenshot({ path: path.join(artifacts, 'native-tabs-minimum.png') });
  await page.setViewportSize({ width: 1280, height: 840 });
  const historyToggle = recent.getByRole('button', { name: /^(收起|显示更多)/ });
  if ((await historyToggle.getAttribute('aria-expanded')) === 'true') await historyToggle.click();
  await expect(recent.getByRole('button', { name: /^history-\d+\.jsonl$/ })).toHaveCount(5);
  const historyRow = recent
    .locator('.file-item')
    .filter({ has: page.getByRole('button', { name: 'history-5.jsonl', exact: true }) });
  const removeHistory = historyRow.getByRole('button', {
    name: '移除历史 history-5.jsonl',
    exact: true,
  });
  await page.getByRole('heading', { name: 'history-5.jsonl', exact: true }).click();
  await expect(removeHistory).toHaveCSS('opacity', '0');
  await historyRow.hover();
  await expect(removeHistory).toHaveCSS('opacity', '1');
  await page.screenshot({ path: path.join(artifacts, 'native-item-history.png') });
  await removeHistory.click();
  await expect(recent.getByRole('button', { name: 'history-5.jsonl', exact: true })).toHaveCount(0);
  await expect(tabs.locator('[data-tab-value]')).toHaveCount(6);
  for (const file of historyPaths) expect(readFileSync(file, 'utf8')).toBe('{"value":1}\n');
  await page.reload();
  await expect(page.getByRole('heading', { name: '打开你的 JSONL 文件' })).toBeVisible();
  await expect(recent.getByRole('button', { name: /^history-\d+\.jsonl$/ })).toHaveCount(5);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('jsonl-viewer:2:recent'))),
  ).toEqual([
    historyPaths[4],
    historyPaths[3],
    historyPaths[2],
    historyPaths[1],
    historyPaths[0],
    ...historyPaths.slice(6),
  ]);
  checks.push(
    '50 recent files, default 5, expand/collapse, item removal persists without closing or deleting files; overflow keyboard works',
  );

  const reopen = spawn(exe, [logs], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => reopen.once('exit', resolve));
  await expect(page.getByRole('heading', { name: 'logs.jsonl', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看第 1 行', exact: true }).click();
  await page
    .getByRole('complementary', { name: '行详情' })
    .getByRole('button', { name: '编辑', exact: true })
    .click();
  const savedLogs = readFileSync(logs, 'utf8');
  await page.getByRole('textbox', { name: '编辑 JSON' }).fill('{"unsaved":true}');
  const finalRow = sidebar
    .locator('.file-item')
    .filter({ has: page.getByRole('button', { name: '关闭 logs.jsonl', exact: true }) });
  await finalRow.hover();
  await finalRow.getByRole('button', { name: '关闭 logs.jsonl', exact: true }).click();
  await expect(page.getByText('放弃未保存的修改？', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '编辑 JSON' })).toHaveValue('{"unsaved":true}');
  await finalRow.hover();
  await finalRow.getByRole('button', { name: '关闭 logs.jsonl', exact: true }).click();
  await page.getByRole('button', { name: '放弃并关闭', exact: true }).click();
  await expect(page.getByRole('heading', { name: '打开你的 JSONL 文件' })).toBeVisible();
  expect(readFileSync(logs, 'utf8')).toBe(savedLogs);
  await page.screenshot({ path: path.join(artifacts, 'native-recent-after-close.png') });
  checks.push(
    'sidebar dirty close preserves draft on cancel, discard closes last tab without writing',
  );
  const missingFile = path.join(directory, 'missing.jsonl');
  await page.evaluate(
    (file) => localStorage.setItem('jsonl-viewer:2:recent', JSON.stringify([file])),
    missingFile,
  );
  await page.reload();
  await page
    .getByRole('region', { name: '最近文件' })
    .getByRole('button', { name: 'missing.jsonl', exact: true })
    .click();
  const errorToast = page.locator('.astryx-toast[role="alert"]');
  await expect(errorToast).toBeVisible();
  await expect(page.locator('.astryx-toast')).toHaveCount(1);
  await expect(page.locator('[data-astryx-toast-fallback]')).toHaveCount(0);
  for (const zoom of [80, 150, 100]) {
    await page.setViewportSize({ width: 1280, height: 840 });
    await page.getByRole('button', { name: /^\d+%$/ }).click();
    for (let step = 0; step < Math.abs(zoom - 100) / 10; step++)
      await page.getByRole('button', { name: zoom < 100 ? '缩小' : '放大', exact: true }).click();
    for (const width of [1280, 720]) {
      await page.setViewportSize({ width, height: 840 });
      await expect
        .poll(async () =>
          page
            .locator('.astryx-toast')
            .evaluate((element) =>
              Math.round(window.innerHeight - element.getBoundingClientRect().bottom),
            ),
        )
        .toBe(80);
    }
  }
  await page.setViewportSize({ width: 1280, height: 840 });
  await page.screenshot({ path: path.join(artifacts, 'native-error-toast-raised.png') });
  await page
    .getByRole('region', { name: '最近文件' })
    .getByRole('button', { name: 'missing.jsonl', exact: true })
    .click();
  await expect(page.locator('.astryx-toast')).toHaveCount(2);
  await expect(
    page.locator('[popover="manual"]').filter({ has: page.locator('.astryx-toast') }),
  ).toHaveCount(1);
  await expect
    .poll(async () =>
      page
        .locator('.astryx-toast')
        .last()
        .evaluate((element) =>
          Math.round(window.innerHeight - element.getBoundingClientRect().bottom),
        ),
    )
    .toBe(80);
  expect(
    await page
      .locator('.astryx-toast')
      .first()
      .evaluate((element) => window.innerHeight - element.getBoundingClientRect().bottom),
  ).toBeGreaterThan(80);
  checks.push(
    'active file close stays visible; shared save/error toast anchors 80px above edge at 80/100/150% zoom and 720/1280 widths',
  );
  expect(errors).toEqual([]);
  for (const toast of await page.locator('.astryx-toast').all())
    await toast.getByRole('button').click();
  await verifyInspector({
    page,
    directory,
    artifacts,
    openFile: async (file) => {
      const child = spawn(exe, [file], { stdio: 'ignore', windowsHide: true });
      await new Promise((resolve) => child.once('exit', resolve));
    },
  });
  checks.push(
    'overlay inspector keeps main layout; half viewport capped at 960px, full height at all zooms; single scrolling body, real edit/save and invalid draft retention',
  );
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: checks, runtimeErrors: errors, artifacts }, null, 2));
} finally {
  if (processHandle.exitCode === null)
    execFileSync('taskkill', ['/PID', String(processHandle.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  if (browser) await browser.close();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const resolved = path.resolve(directory);
  if (
    !resolved.startsWith(path.resolve(tmpdir()) + path.sep) ||
    !path.basename(resolved).startsWith('jsonl-viewer-native-')
  )
    throw new Error('Unexpected cleanup target');
  rmSync(resolved, { recursive: true, force: true, maxRetries: 6, retryDelay: 300 });
}
