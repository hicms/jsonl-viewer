import { expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

export async function verifyTraceNavigation({ page, directory, artifacts, openFile }) {
  const file = path.join(directory, 'navigation.jsonl');
  const records = [
    { type: 'session_meta', payload: { id: 'navigation-session', thread_source: 'user' } },
    ...Array.from({ length: 10 }, (_, index) => ({
      type: 'response_item',
      payload: {
        type: 'message',
        role: index % 2 ? 'assistant' : 'user',
        content: [
          {
            type: index % 2 ? 'output_text' : 'input_text',
            text:
              `nav-message-${index}\n\n` +
              Array.from(
                { length: 30 },
                (_, line) => `Paragraph ${line}: ${'long message '.repeat(8)}`,
              ).join('\n\n') +
              '\n\n```json\n' +
              JSON.stringify({ entries: Array.from({ length: 40 }, (_, item) => item) }, null, 2) +
              '\n```',
          },
        ],
      },
    })),
  ];
  writeFileSync(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
  await openFile(file);
  await expect(page.getByRole('heading', { name: 'navigation.jsonl', exact: true })).toBeVisible();
  const newest = page.getByRole('button', { name: '最新在前', exact: true });
  if (await newest.isVisible()) await newest.click();
  const scroller = page.locator('.trace-scroll');
  const navigation = page.locator('.trace-navigation');
  const down = navigation.getByRole('button', { name: '下一条消息', exact: true });
  const up = navigation.getByRole('button', { name: '上一条消息', exact: true });
  async function atMessage(sourceLine, ordinal) {
    await expect(navigation).toContainText(`${ordinal} / 10`);
    await expect
      .poll(async () => {
        const viewport = await scroller.boundingBox();
        const message = await scroller
          .locator(`.trace-entry[data-message="true"][data-line="${sourceLine}"]`)
          .boundingBox();
        return Math.abs(message.y - viewport.y);
      })
      .toBeLessThan(5);
  }
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(navigation).toContainText('1 / 10');
  await expect(up).toBeDisabled();
  await down.click();
  await atMessage(9, 2);
  await expect(navigation.getByRole('button', { name: '跟随最新', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, 'native-trace-next-from-first.png') });
  await down.click();
  await down.click();
  await atMessage(7, 4);
  await up.click();
  await atMessage(8, 3);
  await page.keyboard.press(']');
  await atMessage(7, 4);
  await page.keyboard.press('[');
  await atMessage(8, 3);
  await scroller.locator('.trace-entry[data-line="5"]').evaluate((element) => {
    element.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await expect(navigation).toContainText('6 / 10');
  await down.click();
  await atMessage(4, 7);
  const search = page.getByRole('textbox', { name: '搜索已加载内容', exact: true });
  await search.fill('nav-message-4');
  await expect(navigation).toContainText('1 / 1');
  await expect(up).toBeDisabled();
  await expect(down).toBeDisabled();
  await search.fill('no-matching-message');
  await expect(navigation).toContainText('0 / 0');
  await expect(up).toBeDisabled();
  await expect(down).toBeDisabled();
  await search.fill('');
  await page.getByRole('button', { name: '从旧到新', exact: true }).click();
  await expect(navigation).toContainText('10 / 10');
  await expect(down).toBeDisabled();
  await up.click();
  await atMessage(9, 9);
  await page.getByRole('button', { name: '最新在前', exact: true }).click();
  await page.setViewportSize({ width: 720, height: 840 });
  await expect(navigation).toContainText('1 / 10');
  await down.click();
  await atMessage(9, 2);
  await page.screenshot({ path: path.join(artifacts, 'native-trace-next-narrow.png') });
  await page.setViewportSize({ width: 1280, height: 840 });
}
