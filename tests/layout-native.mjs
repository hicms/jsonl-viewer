import { expect } from '@playwright/test';
import path from 'node:path';
import { writeFileSync } from 'node:fs';

export async function openPreferences(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const selector = page.getByRole('combobox', { name: /^(Language|语言)$/ });
  if (!(await selector.isVisible()))
    await page.getByRole('button', { name: /Open navigation|打开导航/ }).click();
  await expect(selector).toBeVisible();
  await page.locator('.workspace-preferences').scrollIntoViewIfNeeded();
}

export async function closeNavigation(page) {
  const close = page.getByRole('button', { name: /Close navigation|关闭导航/ });
  if (await close.isVisible()) await close.click();
}

export async function setZoom(page, zoom) {
  await openPreferences(page);
  await page.getByRole('button', { name: /^\d+%$/ }).click();
  for (let step = 0; step < Math.abs(zoom - 100) / 10; step++) {
    await openPreferences(page);
    await page
      .getByRole('button', { name: zoom < 100 ? /^(缩小|Zoom out)$/ : /^(放大|Zoom in)$/ })
      .click();
  }
  await closeNavigation(page);
}

export async function verifyLayout({ page, artifacts, directory, openFile, logs }) {
  const columns = page.getByRole('button', { name: '显示列', exact: true });
  const search = page.getByRole('textbox', { name: '搜索已加载内容' });
  await columns.click();
  await page.getByRole('option', { name: 'details', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('columnheader', { name: /details/ })).toHaveCount(0);
  await search.fill('找不到这条记录');
  await columns.click();
  await expect(page.getByRole('option', { name: 'details', exact: true })).toBeVisible();
  await page.getByRole('option', { name: 'details', exact: true }).click();
  await page.keyboard.press('Escape');
  await search.fill('');
  await expect(page.getByRole('columnheader', { name: /details/ })).toBeVisible();

  const longName = `${'long-document-name-'.repeat(8)}.jsonl`;
  const longFile = path.join(directory, longName);
  writeFileSync(
    longFile,
    JSON.stringify({
      message: 'long path layout',
      ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`field-${i}`, i])),
    }) + '\n',
  );
  await openFile(longFile);
  await expect(page.getByRole('heading', { name: longName, exact: true })).toBeVisible();

  for (const zoom of [100, 150]) {
    await page.setViewportSize({ width: 1280, height: 840 });
    await setZoom(page, zoom);
    for (const width of [1280, 720]) {
      await page.setViewportSize({ width, height: 600 });
      if (width === 720)
        await expect(page.getByRole('button', { name: '打开导航', exact: true })).toBeVisible();
      await openPreferences(page);
      for (const control of [
        page.getByRole('combobox', { name: '语言', exact: true }),
        page.getByRole('combobox', { name: '主题模式', exact: true }),
        page.getByRole('button', { name: '放大', exact: true }),
      ]) {
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeInViewport();
        await expect
          .poll(async () => {
            const box = await control.boundingBox();
            return box.x + box.width;
          })
          .toBeLessThanOrEqual(width + 1);
        const box = await control.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
        expect(box.y + box.height).toBeLessThanOrEqual(601);
      }
      await page.screenshot({
        path: path.join(artifacts, `native-layout-preferences-${width}-${zoom}.png`),
      });
      await closeNavigation(page);
      await expect(search).toBeInViewport();
      await expect(columns).toBeInViewport();
      const toolbar = await page.locator('.file-toolbar').boundingBox();
      const searchBox = await search.boundingBox();
      expect(searchBox.width / toolbar.width).toBeGreaterThan(0.85);
      const footer = await page.locator('.status-bar').boundingBox();
      expect(footer.y + footer.height).toBeLessThanOrEqual(601);
      const root = await page.locator('.workspace').boundingBox();
      expect(root.x + root.width).toBeLessThanOrEqual(width + 1);
      const inspect = page.getByRole('button', { name: '查看第 1 行', exact: true });
      await inspect.scrollIntoViewIfNeeded();
      await expect(inspect).toBeInViewport();
      await inspect.click();
      await expect(page.getByRole('complementary', { name: '行详情' })).toContainText(
        'long path layout',
      );
      await page.getByRole('button', { name: '关闭详情', exact: true }).click();
      await page.screenshot({ path: path.join(artifacts, `native-layout-${width}-${zoom}.png`) });
    }
  }
  await page.setViewportSize({ width: 1280, height: 840 });
  await setZoom(page, 100);
  const handle = page.getByRole('separator', { name: '调整侧边栏尺寸', exact: true });
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(180, handleBox.y + handleBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.screenshot({ path: path.join(artifacts, 'native-layout-sidebar-min.png') });
  const sidebar = await page.getByRole('navigation', { name: '文件浏览器' }).boundingBox();
  const zoomButton = await page.getByRole('button', { name: '放大', exact: true }).boundingBox();
  expect(zoomButton.x + zoomButton.width).toBeLessThanOrEqual(sidebar.x + sidebar.width + 1);
  const smallHandle = await handle.boundingBox();
  await page.mouse.move(
    smallHandle.x + smallHandle.width / 2,
    smallHandle.y + smallHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(248, smallHandle.y + smallHandle.height / 2, { steps: 12 });
  await page.mouse.up();
  await page
    .getByRole('navigation', { name: '打开的文件' })
    .getByRole('button', { name: `关闭 ${longName}`, exact: true })
    .click();
  await openFile(logs);
}
