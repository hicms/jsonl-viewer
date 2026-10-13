import { expect } from '@playwright/test';
import path from 'node:path';
import { setZoom, closeNavigation } from './layout-native.mjs';

export async function verifySidebarCollapse(page, artifacts) {
  const sidebar = page.getByRole('navigation', { name: '文件浏览器', exact: true });
  const collapse = page.getByRole('button', { name: '折叠侧边栏', exact: true });
  const expand = page.getByRole('button', { name: '展开侧边栏', exact: true });
  const search = page.getByRole('textbox', { name: '搜索已加载内容', exact: true });
  await search.fill('服务已启动');
  async function checkRightAligned(button, zoom) {
    await expect
      .poll(async () => {
        const bounds = await sidebar.boundingBox();
        const control = await button.boundingBox();
        return bounds.x + bounds.width - (control.x + control.width);
      })
      .toBeLessThanOrEqual((24 * zoom) / 100);
    const bounds = await sidebar.boundingBox();
    const control = await button.boundingBox();
    expect(control.x + control.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    if (bounds.width > 100) expect(control.x).toBeGreaterThan(bounds.x + bounds.width / 2);
  }
  async function checkCollapsed(zoom) {
    await expect(expand).toBeVisible();
    await expect
      .poll(async () => (await sidebar.boundingBox()).width)
      .toBeCloseTo((48 * zoom) / 100, 1);
    await checkRightAligned(expand, zoom);
    await expect(sidebar.getByRole('heading')).toHaveCount(0);
    await expect(sidebar.getByRole('combobox')).toHaveCount(0);
    const bounds = await sidebar.boundingBox();
    for (const button of await sidebar.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
    }
    await expect(search).toHaveValue('服务已启动');
    await expect(page.getByRole('table').getByText('服务已启动', { exact: true })).toBeVisible();
  }
  for (const zoom of [100, 80, 150]) {
    await page.setViewportSize({ width: 1280, height: 840 });
    await setZoom(page, zoom);
    const width = (await sidebar.boundingBox()).width;
    await checkRightAligned(collapse, zoom);
    await collapse.click();
    await checkCollapsed(zoom);
    await page.screenshot({ path: path.join(artifacts, `native-sidebar-collapsed-${zoom}.png`) });
    await expand.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await sidebar.boundingBox()).width).toBe(width);
    await checkRightAligned(collapse, zoom);
    await expect(sidebar.getByRole('combobox', { name: '语言', exact: true })).toBeVisible();
  }
  await setZoom(page, 100);
  await expect(search).toHaveValue('服务已启动');
  const handle = page.getByRole('separator', { name: '调整侧边栏尺寸', exact: true });
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(10, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  await checkCollapsed(100);

  await page.setViewportSize({ width: 720, height: 600 });
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.getByRole('combobox', { name: '语言', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('combobox', { name: '语言', exact: true })).toBeInViewport();
  await closeNavigation(page);
  await page.setViewportSize({ width: 1280, height: 840 });
  await checkCollapsed(100);
  await page.reload();
  await expect(expand).toBeVisible();
  await expect(sidebar.getByRole('combobox')).toHaveCount(0);
  await expand.click();
  await page
    .getByRole('region', { name: '最近文件', exact: true })
    .getByRole('button', { name: 'logs.jsonl', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'logs.jsonl', exact: true })).toBeVisible();
  await expect(search).toHaveValue('');
  await page.screenshot({ path: path.join(artifacts, 'native-sidebar-expanded.png') });
}
