import { setZoom } from './layout-native.mjs';
import { expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export async function verifyInspector({ page, directory, artifacts, openFile }) {
  const file = path.join(directory, 'inspector.jsonl');
  const record = {
    message: '长内容详情',
    entries: Array.from({ length: 240 }, (_, index) => ({
      index,
      text: `完整内容 ${index}: ${'需要自动换行的长文本 '.repeat(8)}`,
    })),
    last: '内容末尾',
  };
  writeFileSync(file, JSON.stringify(record) + '\n');
  await openFile(file);
  await expect(page.getByRole('heading', { name: 'inspector.jsonl', exact: true })).toBeVisible();
  const panel = page.getByRole('complementary', { name: '行详情' });
  const content = panel.locator('.inspector-content');
  const open = () => page.getByRole('button', { name: '查看第 1 行', exact: true }).click();
  const close = () => panel.getByRole('button', { name: '关闭详情', exact: true }).click();
  async function onlyContentScrolls() {
    await expect
      .poll(() =>
        panel.evaluate((element) =>
          [element, ...element.querySelectorAll('*')]
            .filter(
              (node) =>
                /auto|scroll/.test(getComputedStyle(node).overflowY) &&
                node.scrollHeight > node.clientHeight + 1,
            )
            .map((node) => node.classList.contains('inspector-content')),
        ),
      )
      .toEqual([true]);
    await content.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    for (const button of [
      panel.getByRole('button', { name: '关闭详情', exact: true }),
      panel.getByRole('button', { name: /^复制/ }),
    ]) {
      const box = await button.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(841);
    }
  }
  for (const zoom of [80, 150, 100]) {
    await page.setViewportSize({ width: 1280, height: 840 });
    await setZoom(page, zoom);
    for (const width of [720, 1280, 2560]) {
      await page.setViewportSize({ width, height: 840 });
      let previous;
      let stableFrames = 0;
      await expect
        .poll(
          async () => {
            const current = JSON.stringify(await page.locator('.view-area').boundingBox());
            stableFrames = current === previous ? stableFrames + 1 : 0;
            previous = current;
            return stableFrames;
          },
          { intervals: [50, 100] },
        )
        .toBeGreaterThanOrEqual(3);
      const before = await page.locator('.view-area').boundingBox();
      await open();
      await expect(panel).toBeVisible();
      const after = await page.locator('.view-area').boundingBox();
      expect(after).toEqual(before);
      await expect
        .poll(async () => {
          const box = await panel.boundingBox();
          return {
            x: Math.round(box.x),
            y: Math.round(box.y),
            width: Math.round(box.width),
            height: Math.round(box.height),
          };
        })
        .toEqual({
          x: width - Math.min(width / 2, 960),
          y: 40,
          width: Math.min(width / 2, 960),
          height: 800,
        });
      await onlyContentScrolls();
      await panel.getByRole('button', { name: '原文', exact: true }).click();
      await onlyContentScrolls();
      if (zoom === 100) {
        await page.screenshot({ path: path.join(artifacts, `native-inspector-${width}.png`) });
      }
      await close();
    }
  }
  await page.setViewportSize({ width: 1280, height: 840 });
  await page.getByRole('combobox', { name: '主题模式' }).click();
  await page.getByRole('option', { name: '深色', exact: true }).click();
  await open();
  await onlyContentScrolls();
  await page.screenshot({ path: path.join(artifacts, 'native-inspector-dark.png') });
  await panel.getByRole('button', { name: '编辑', exact: true }).click();
  const input = panel.getByRole('textbox', { name: '编辑 JSON' });
  const changed = { ...record, last: '保存后的末尾' };
  const draft = JSON.stringify(changed, null, 2);
  await input.fill(draft);
  await expect(input).toHaveCSS('field-sizing', 'content');
  await onlyContentScrolls();
  expect(
    await input.evaluate((element) => element.scrollHeight - element.clientHeight),
  ).toBeLessThanOrEqual(1);
  // The final characters remain reachable through the single content scroller.
  const inputBox = await input.boundingBox();
  const contentBox = await content.boundingBox();
  expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(contentBox.y + contentBox.height + 1);
  await page.screenshot({ path: path.join(artifacts, 'native-inspector-edit.png') });
  await input.fill(draft + '}');
  await expect(panel.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await close();
  await open();
  await expect(input).toHaveValue(draft + '}');
  await input.fill(draft);
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await expect(() => {
    expect(JSON.parse(readFileSync(file, 'utf8')).last).toBe('保存后的末尾');
  }).toPass({ timeout: 5_000 });
  await close();
  await page.getByRole('combobox', { name: '主题模式' }).click();
  await page.getByRole('option', { name: '浅色', exact: true }).click();
}
