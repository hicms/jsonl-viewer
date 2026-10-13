import { expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { setZoom, closeNavigation } from './layout-native.mjs';

export async function verifyFileTabs({ page, directory, artifacts, openFile }) {
  const names = ['analysis.jsonl', `${'long-file-name-'.repeat(8)}.jsonl`, 'results.jsonl'];
  for (const name of names) {
    const file = path.join(directory, name);
    writeFileSync(file, JSON.stringify({ message: name }) + '\n');
    await openFile(file);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  const tabs = page.getByRole('navigation', { name: '打开的文件', exact: true });
  const tab = (name) =>
    tabs
      .locator('.file-tab')
      .filter({ has: page.getByRole('button', { name: `关闭 ${name}`, exact: true }) });
  const longTab = tab(names[1]);
  const longButton = longTab.locator('[data-tab-value]');
  const results = tab(names[2]);
  for (const mode of ['浅色', '深色']) {
    await page.getByRole('combobox', { name: '主题模式', exact: true }).click();
    await page.getByRole('option', { name: mode, exact: true }).click();
    for (const zoom of [80, 100, 150]) {
      await setZoom(page, zoom);
      for (const width of [1280, 720]) {
        await page.setViewportSize({ width, height: 840 });
        await results.locator('[data-tab-value]').click();
        await longButton.hover();
        for (const button of [longButton, results.locator('[data-tab-value]')]) {
          await expect(button).toHaveCSS('border-top-left-radius', '10px');
          await expect(button).toHaveCSS('border-top-right-radius', '10px');
          await expect(button).toHaveCSS('border-bottom-left-radius', '0px');
          await expect(button).toHaveCSS('border-bottom-right-radius', '0px');
          await expect(button.locator('.astryx-tab-indicator')).toHaveCSS('display', 'none');
        }
        const hoverColor = await longButton.evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        );
        expect(hoverColor).not.toBe('rgba(0, 0, 0, 0)');
        const label = longButton.locator(':scope > span:nth-child(3)');
        expect(
          await label.evaluate((element) => {
            const text = element.firstElementChild;
            return text.scrollWidth > text.clientWidth;
          }),
        ).toBe(true);
        const buttonBox = await longButton.boundingBox();
        const labelBox = await label.boundingBox();
        const close = longTab.getByRole('button', { name: `关闭 ${names[1]}`, exact: true });
        const closeBox = await close.boundingBox();
        expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(closeBox.x);
        expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(buttonBox.x + buttonBox.width);
        const strip = await tabs.boundingBox();
        expect(strip.x + strip.width).toBeLessThanOrEqual(width);
        if (zoom === 100)
          await page.screenshot({
            path: path.join(artifacts, `native-file-tabs-${mode}-${width}.png`),
          });
        await longButton.click();
        await expect(page.getByRole('heading', { name: names[1], exact: true })).toBeVisible();
        await expect(longButton).toHaveAttribute('aria-current', 'true');
      }
      await page.setViewportSize({ width: 1280, height: 840 });
    }
  }
  await setZoom(page, 100);
  await page.getByRole('combobox', { name: '主题模式', exact: true }).click();
  await page.getByRole('option', { name: '浅色', exact: true }).click();
  await closeNavigation(page);
  await results.locator('[data-tab-value]').click();
  await longTab.hover();
  await longTab.getByRole('button', { name: `关闭 ${names[1]}`, exact: true }).click();
  await expect(longTab).toHaveCount(0);
  await expect(page.getByRole('heading', { name: names[2], exact: true })).toBeVisible();
}
