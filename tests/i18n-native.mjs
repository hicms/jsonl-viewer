import { expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

async function chooseLanguage(page, name) {
  const selector = page.getByRole('combobox', { name: /^(Language|语言)$/ });
  if (!(await selector.isVisible()))
    await page.getByRole('button', { name: /Open navigation|打开导航/ }).click();
  await selector.click();
  await page.getByRole('option', { name, exact: true }).click();
}

export async function verifyAutomaticLanguage(page) {
  const expected = await page.evaluate(() =>
    /^zh(?:-|$)/i.test(navigator.languages[0] ?? navigator.language) ? 'zh-CN' : 'en',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', expected);
  console.log(
    'automatic language',
    await page.evaluate(() => ({
      languages: navigator.languages,
      selected: document.documentElement.lang,
    })),
  );
  expect(await page.evaluate(() => localStorage.getItem('jsonl-viewer:2:language'))).toBeNull();
  await chooseLanguage(page, '简体中文');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
}

export async function verifyLanguages({ page, directory, artifacts, openFile }) {
  const file = path.join(directory, 'language.jsonl');
  const source = Array.from(
    { length: 6001 },
    (_, id) => ` {"id":${id},"message":"source-${id}"}\r\n${id === 1 ? '\r\n' : ''}`,
  ).join('');
  writeFileSync(file, source);
  await openFile(file);
  await expect(page.getByRole('heading', { name: 'language.jsonl', exact: true })).toBeVisible();
  await chooseLanguage(page, 'English');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect line 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand row', exact: true }).first()).toBeVisible();
  await expect(page.locator('.status-bar')).toContainText('1,000 records loaded');
  for (const width of [720, 1280]) {
    await page.setViewportSize({ width, height: 840 });
    const selector = page.getByRole('combobox', { name: 'Language', exact: true });
    if (width === 720) {
      const openNavigation = page.getByRole('button', { name: 'Open navigation', exact: true });
      await expect(openNavigation).toBeVisible();
      await openNavigation.click();
    }
    await expect(selector).toBeVisible();
    await expect
      .poll(async () => {
        const box = await selector.boundingBox();
        return box.x + box.width;
      })
      .toBeLessThanOrEqual(width);
    const box = await selector.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: path.join(artifacts, `native-language-en-${width}.png`) });
    const closeNavigation = page.getByRole('button', { name: 'Close navigation', exact: true });
    if (await closeNavigation.isVisible()) await closeNavigation.click();
  }
  const firstRow = page.locator('tr[data-record-index="0"]');
  await firstRow.getByRole('button', { name: 'Expand row', exact: true }).click();
  await chooseLanguage(page, '简体中文');
  await expect(firstRow.getByRole('button', { name: '折叠行', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.getByRole('button', { name: '复制代码', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '转到下一页', exact: true }).click();
  await expect(page.getByRole('table').getByText('source-100', { exact: true })).toBeVisible();
  await chooseLanguage(page, 'English');
  await expect(page.getByRole('table').getByText('source-100', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Go to previous page', exact: true }).click();
  await expect(firstRow.getByRole('button', { name: 'Collapse row', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await firstRow.getByRole('button', { name: 'Collapse row', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect line 1', exact: true }).click();
  let panel = page.getByRole('complementary', { name: 'Row details' });
  await panel.getByRole('button', { name: 'Edit', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Edit JSON' });
  const node = await input.elementHandle();
  const incomplete = '{"id":0,"message":';
  await input.fill(incomplete);
  await chooseLanguage(page, '简体中文');
  panel = page.getByRole('complementary', { name: '行详情' });
  await expect(page.getByRole('textbox', { name: '编辑 JSON' })).toHaveValue(incomplete);
  expect(await node.evaluate((element) => element.isConnected)).toBe(true);
  await expect(panel.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await chooseLanguage(page, 'English');
  await expect(input).toHaveValue(incomplete);
  await input.fill('{"id":0,"message":"saved-after-language-switch"}');
  await chooseLanguage(page, '简体中文');
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('已保存完整文件', { exact: true }).last()).toBeVisible();
  await expect(() => {
    expect(readFileSync(file, 'utf8')).toBe(
      source.replace(
        ' {"id":0,"message":"source-0"}',
        '{"id":0,"message":"saved-after-language-switch"}',
      ),
    );
  }).toPass({ timeout: 5_000 });
  await panel.getByRole('button', { name: '编辑中', exact: true }).click();
  await panel.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.screenshot({ path: path.join(artifacts, 'native-language-zh-CN.png') });

  // A real WebView reload reinitializes application state from persisted settings.
  await page.reload();
  await expect(page.getByText('打开你的 JSONL 文件', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await chooseLanguage(page, 'English');
  await page.reload();
  await expect(page.getByText('Open your JSONL file', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setLocaleOverride', { locale: 'zh-CN' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const expected = await page.evaluate(() =>
    /^zh(?:-|$)/i.test(navigator.languages[0] ?? navigator.language) ? 'zh-CN' : 'en',
  );
  await chooseLanguage(page, 'System');
  await expect(page.locator('html')).toHaveAttribute('lang', expected);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', expected);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('jsonl-viewer:2:language'))),
  ).toBe('system');
  await cdp.send('Emulation.setLocaleOverride', { locale: '' });
  await cdp.detach();
}
