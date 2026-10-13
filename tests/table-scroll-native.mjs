import { expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const button = (page, name) => page.getByRole('button', { name, exact: true });
const tableScroll = (page) => page.locator('.astryx-table-scroll-wrapper');
const flow = (page) => page.locator('.table-expanded .virtual-code-flow');

async function oneScrollbar(page) {
  await expect
    .poll(() =>
      page
        .locator('.view-area')
        .evaluate((area) =>
          [area, ...area.querySelectorAll('*')]
            .filter(
              (element) =>
                /auto|scroll/.test(getComputedStyle(element).overflowY) &&
                element.scrollHeight > element.clientHeight + 1,
            )
            .map((element) => element.classList.contains('astryx-table-scroll-wrapper')),
        ),
    )
    .toEqual([true]);
}

async function bounded(page) {
  await oneScrollbar(page);
  await expect
    .poll(() =>
      flow(page).evaluate((element) => {
        const viewport = element.closest('.astryx-table-scroll-wrapper');
        const detail = element.getBoundingClientRect();
        const bounds = viewport.getBoundingClientRect();
        const zoom = parseFloat(getComputedStyle(element).getPropertyValue('--app-zoom')) || 1;
        return (
          detail.left >= bounds.left &&
          detail.right <= bounds.left + viewport.clientWidth * zoom + 1 &&
          element.scrollTop === 0 &&
          element.scrollWidth <= element.clientWidth + 1
        );
      }),
    )
    .toBe(true);
  await expect
    .poll(() => page.locator('.table-expanded [data-code-row]').count())
    .toBeGreaterThan(0);
  expect(await page.locator('[data-code-row]').count()).toBeLessThan(100);
  expect(await page.locator('*').count()).toBeLessThan(2500);
}

async function tail(page) {
  await tableScroll(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await bounded(page);
  const last = page.locator('.table-expanded [data-code-row]').last();
  await expect(last).toContainText(/}/);
  await expect(last).toBeInViewport();
  expect(Number(await last.getAttribute('data-code-row'))).toBeGreaterThan(1_000_000);
}

export async function verifyExpandedTable(page, artifacts) {
  for (const zoom of [80, 150, 100]) {
    await page.setViewportSize({ width: 1280, height: 840 });
    await page.getByRole('button', { name: /^\d+%$/ }).click();
    for (let i = 0; i < Math.abs(zoom - 100) / 10; i++)
      await button(page, zoom > 100 ? '放大' : '缩小').click();
    for (const [width, height] of [
      [720, 480],
      [1280, 840],
    ]) {
      await page.setViewportSize({ width, height });
      for (const fraction of [0.15, 0.5, 0.85]) {
        await tableScroll(page).evaluate((element, fraction) => {
          element.scrollTop = element.scrollHeight * fraction;
          element.scrollLeft = element.scrollWidth * fraction;
        }, fraction);
        await bounded(page);
      }
      await tail(page);
    }
  }
  await tableScroll(page).evaluate((element) => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
  const box = await tableScroll(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => tableScroll(page).evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await tableScroll(page).focus();
  const beforePage = await tableScroll(page).evaluate((element) => element.scrollTop);
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => tableScroll(page).evaluate((element) => element.scrollTop))
    .toBeGreaterThan(beforePage);
  await tableScroll(page).evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.mouse.move(box.x + box.width - 7, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 7, box.y + box.height - 24, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() => tableScroll(page).evaluate((element) => element.scrollTop))
    .toBeGreaterThan(1000000);
  await bounded(page);
  await tail(page);
  await page.screenshot({ path: path.join(artifacts, 'table-expanded-tail.png') });
  await tableScroll(page).evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page.locator('.table-expanded [data-code-row]').first()).toHaveAttribute(
    'data-code-row',
    '0',
  );
  await page.screenshot({ path: path.join(artifacts, 'table-scroll-layout.png') });

  const header = page.getByRole('columnheader').nth(2);
  const handleBox = await header.getByRole('separator').boundingBox();
  const headerBox = await header.boundingBox();
  expect(handleBox.y + handleBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 40,
    handleBox.y + handleBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await header.boundingBox()).width)
    .toBeGreaterThan(headerBox.width + 20);
  await bounded(page);
}

export async function verifyMultipleTableRows(page, artifacts, openFile) {
  const file = path.join(artifacts, 'table-rows.jsonl');
  writeFileSync(
    file,
    Array.from({ length: 151 }, (_, id) =>
      JSON.stringify({
        id,
        name: `record-${id}`,
        payload: id < 2 ? 'wide 中文 '.repeat(20000) : `value-${id}`,
        a: id,
        b: id,
        c: id,
        d: id,
      }),
    ).join('\n'),
  );
  await openFile(file);
  await expect(page.getByRole('heading', { name: 'table-rows.jsonl', exact: true })).toBeVisible();
  await button(page, '表格').click();
  for (const id of [0, 1, 2]) {
    const row = page.locator(`tr[data-record-index="${id}"]`);
    await row.scrollIntoViewIfNeeded();
    await row.getByRole('button', { name: /展开行|Expand row/ }).click();
  }
  await expect(page.locator('[data-expansion-panel]')).toHaveCount(3);
  await oneScrollbar(page);
  await tableScroll(page).evaluate((element) => {
    element.scrollTop = 1000;
  });
  await expect(flow(page).first().locator('[data-code-row]').first()).toBeAttached();
  expect(await flow(page).last().locator('[data-code-row]').count()).toBe(0);
  const box = await tableScroll(page).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await tableScroll(page).evaluate((element) => element.scrollTop);
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => tableScroll(page).evaluate((element) => element.scrollTop))
    .toBeGreaterThan(before);
  await tableScroll(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator('tr[data-record-index="99"]')).toBeInViewport();
  await expect.poll(() => flow(page).locator('[data-code-row]').count()).toBe(0);
  await oneScrollbar(page);
  await expect(page.getByRole('navigation', { name: '已加载记录分页' })).toBeVisible();
  await page.getByRole('button', { name: /下一页|Next page/ }).click();
  await expect(page.locator('tr[data-record-index="100"]')).toHaveCount(1);
  await tableScroll(page).evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator('tr[data-record-index="150"]')).toBeInViewport();
}
