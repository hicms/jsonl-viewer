import { expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

async function codeText(locator) {
  // Astryx uses content-visibility for long blocks; innerText omits offscreen chunks.
  return (await locator.locator('[data-line]').allTextContents())
    .map((line) => (line === '\u200b' ? '' : line))
    .join('\n');
}

export async function verifyJsonDocument({ page, directory, artifacts, openFile }) {
  const file = path.join(directory, 'backup.json');
  const value = {
    version: 1,
    format: 'multiline-json-backup',
    settings: { language: 'zh-CN', enabled: true },
    entries: Array.from({ length: 1200 }, (_, id) => ({ id, text: `记录 ${id}` })),
    tail: '完整文档末尾',
  };
  const original = JSON.stringify(value, null, 2) + '\n';
  writeFileSync(file, original);
  await openFile(file);
  await expect(page.getByRole('heading', { name: 'backup.json', exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByText(value.format, { exact: true })).toBeVisible();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await page.screenshot({ path: path.join(artifacts, 'native-json-table.png') });
  await page.getByRole('button', { name: '树形', exact: true }).click();
  await expect(page.getByRole('tree')).toBeVisible();
  await page.getByRole('button', { name: '展开全部', exact: true }).click();
  await expect(page.getByRole('tree').getByText('language: zh-CN', { exact: true })).toBeVisible();
  await page
    .getByRole('tree')
    .getByText('tail: 完整文档末尾', { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.getByRole('tree').getByText('text: 记录 1199', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '折叠全部', exact: true }).click();
  await page.screenshot({ path: path.join(artifacts, 'native-json-tree.png') });
  await page.getByRole('button', { name: '原文', exact: true }).click();
  await expect(page.locator('.view-area pre')).toHaveCount(1);
  expect(JSON.parse(await codeText(page.locator('.view-area pre code')))).toEqual(value);
  await page.screenshot({ path: path.join(artifacts, 'native-json-raw.png') });
  await page.getByRole('button', { name: '第 1 行', exact: true }).click();
  const panel = page.getByRole('complementary', { name: '行详情' });
  expect(JSON.parse(await codeText(panel.locator('pre code')))).toEqual(value);
  await panel.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = panel.getByRole('textbox', { name: '编辑 JSON' });
  expect((await editor.boundingBox()).height).toBeLessThan(840);
  expect(await editor.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  value.version = 2;
  await editor.press('Control+Home');
  await editor.press('ArrowDown');
  await editor.press('End');
  await editor.press('ArrowLeft');
  await editor.press('Backspace');
  await editor.press('2');
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => JSON.parse(readFileSync(file, 'utf8')).version).toBe(2);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(value);
  expect(readFileSync(file, 'utf8')).toBe(JSON.stringify(value, null, 2) + '\n');
  await panel.getByRole('button', { name: '编辑中', exact: true }).click();
  await panel.getByRole('button', { name: '关闭详情', exact: true }).click();
  // A fresh document identity reads the actual saved bytes through Rust again.
  await page
    .getByRole('navigation', { name: '打开的文件' })
    .getByRole('button', { name: '关闭 backup.json', exact: true })
    .click();
  await openFile(file);
  await expect(page.getByRole('table').getByText(value.format, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '原文', exact: true }).click();
  await expect(page.locator('.view-area pre code')).toBeVisible();
  expect(JSON.parse(await codeText(page.locator('.view-area pre code')))).toEqual(value);
}
