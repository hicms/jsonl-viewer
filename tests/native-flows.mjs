import { expect } from '@playwright/test';
import { appendFileSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { windowAction } from './titlebar-native.mjs';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const inspector = (page) => page.getByRole('complementary', { name: '行详情' });
const closeFile = (page, name) =>
  button(page.getByRole('navigation', { name: '文件浏览器' }), `关闭 ${name}`).click();

export async function verifyViews({ page }) {
  await expect(page.getByRole('table')).toBeVisible();
  const search = page.getByRole('textbox', { name: '搜索已加载内容' });
  await search.fill('内存使用');
  await expect(page.getByRole('table').getByText('内存使用情况')).toBeVisible();
  await expect(page.getByRole('table').getByText('服务已启动')).toHaveCount(0);
  await search.fill('');
  await button(page, '树形').click();
  await button(page, '展开全部').click();
  await expect(page.getByRole('tree').getByText('port: 3000', { exact: true })).toBeVisible();
  await button(page, '原文').click();
  await expect(button(page, '第 1 行')).toBeVisible();
  await button(page, '表格').click();
  await expect(page.getByRole('table')).toBeVisible();
}

export async function verifyJsonlSave({ page, directory, openFile, processId }) {
  const file = path.join(directory, 'large.jsonl');
  const original = Array.from(
    { length: 2001 },
    (_, id) => ` {"id":${id},"message":"record-${id}"}\r\n${id === 1 ? '\r\n' : ''}`,
  ).join('');
  writeFileSync(file, original);
  await openFile(file);
  await expect(page.getByRole('heading', { name: 'large.jsonl', exact: true })).toBeVisible();
  await button(page, '表格').click();
  await expect(page.locator('.status-bar')).toContainText('已加载 1,000 条');
  await button(page, '加载更多').click();
  await expect(page.locator('.status-bar')).toContainText('已加载 2,000 条');
  await button(page, '查看第 1 行').click();
  await button(inspector(page), '编辑').click();
  const editor = page.getByRole('textbox', { name: '编辑 JSON' });
  const draft = '{"id":0,"message":"saved-from-WebView2"}';
  await editor.fill(draft);
  for (const close of [
    () => closeFile(page, 'large.jsonl'),
    () => button(page, '关闭窗口').click(),
    () => windowAction(processId, 'close'),
  ]) {
    await close();
    await expect(page.getByText('放弃未保存的修改？', { exact: true })).toBeVisible();
    await button(page, '继续编辑').click();
    await expect(editor).toHaveValue(draft);
    expect(readFileSync(file, 'utf8')).toBe(original);
  }
  await button(inspector(page), '保存').click();
  // Compare all bytes, including the unloaded final record, CRLF and blank lines.
  const saved = draft + original.slice(original.indexOf('\r\n'));
  await expect.poll(() => readFileSync(file, 'utf8')).toBe(saved);
  await expect(page.getByText('已保存完整文件', { exact: true }).first()).toBeVisible();
  await editor.fill('{"unfinished":');
  await closeFile(page, 'large.jsonl');
  await button(page, '继续编辑').click();
  await expect(editor).toHaveValue('{"unfinished":');
  await closeFile(page, 'large.jsonl');
  await button(page, '放弃并关闭').click();
  await expect(page.getByRole('heading', { name: 'large.jsonl', exact: true })).toHaveCount(0);
  expect(readFileSync(file, 'utf8')).toBe(saved);
}

export async function verifyJsonDocument({ page, directory, openFile }) {
  const file = path.join(directory, 'backup.json');
  const value = { version: 1, entries: Array.from({ length: 1200 }, (_, id) => ({ id })) };
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  await openFile(file);
  await expect(page.getByRole('heading', { name: 'backup.json', exact: true })).toBeVisible();
  await button(page, '表格').click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await button(page, '原文').click();
  await button(page, '第 1 行').click();
  await button(inspector(page), '编辑').click();
  const editor = page.getByRole('textbox', { name: '编辑 JSON' });
  expect(JSON.parse(await editor.inputValue())).toEqual(value);
  value.version = 2;
  await editor.fill(JSON.stringify(value));
  await button(inspector(page), '保存').click();
  await expect.poll(() => readFileSync(file, 'utf8')).toBe(JSON.stringify(value, null, 2) + '\n');
  await closeFile(page, 'backup.json');
  await expect(page.getByRole('heading', { name: 'backup.json', exact: true })).toHaveCount(0);
  await openFile(file);
  await expect(page.getByRole('heading', { name: 'backup.json', exact: true })).toBeVisible();
  await button(page, '原文').click();
  await button(page, '第 1 行').click();
  await button(inspector(page), '编辑').click();
  expect(JSON.parse(await editor.inputValue())).toEqual(value);
  await closeFile(page, 'backup.json');
  await expect(page.getByRole('heading', { name: 'backup.json', exact: true })).toHaveCount(0);
}

export async function verifySession({ page, directory, root, openFile }) {
  const file = path.join(directory, 'session.jsonl');
  copyFileSync(path.join(root, 'tests/fixtures/session.jsonl'), file);
  await openFile(file);
  await expect(page.getByText('Codex 会话', { exact: true })).toBeVisible();
  await expect(
    page.getByText('帮我检查数据文件，确认每一行都是有效 JSON。', { exact: true }),
  ).toBeVisible();
  appendFileSync(
    file,
    '\n' +
      JSON.stringify({
        type: 'event_msg',
        payload: { type: 'agent_message', message: '实时追加已到达' },
      }) +
      '\n',
  );
  await expect(page.getByText('实时追加已到达', { exact: true })).toBeVisible({ timeout: 10000 });
}
