import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function windowAction(processId, action) {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-File',
      path.resolve('tests/window-native.ps1'),
      '-ViewerProcessId',
      String(processId),
      '-Action',
      action,
    ],
    { stdio: 'pipe', windowsHide: true },
  );
}

export async function verifyTitlebar({ page, processId }) {
  const nativeState = (command) =>
    page.evaluate(
      (name) => window.__TAURI_INTERNALS__.invoke(`plugin:window|${name}`, { label: 'main' }),
      command,
    );
  expect(await nativeState('is_decorated')).toBe(false);
  await expect(page.locator('.window-titlebar')).toBeVisible();
  await page.getByRole('button', { name: '最大化窗口', exact: true }).click();
  await expect.poll(() => nativeState('is_maximized')).toBe(true);
  await page.getByRole('button', { name: '还原窗口', exact: true }).click();
  await expect.poll(() => nativeState('is_maximized')).toBe(false);
  // Exercise the real modal drawer: window controls must remain interactive.
  await page.setViewportSize({ width: 720, height: 600 });
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await expect(page.locator('dialog:modal .window-controls')).toHaveCount(1);
  await page.getByRole('button', { name: '最小化窗口', exact: true }).click();
  await expect.poll(() => nativeState('is_minimized')).toBe(true);
  windowAction(processId, 'restore');
  await expect.poll(() => nativeState('is_minimized')).toBe(false);
  await page.getByRole('button', { name: '关闭导航', exact: true }).click();
  await expect(page.locator('dialog:modal')).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 840 });
  await page.keyboard.press('F11');
  await expect.poll(() => nativeState('is_fullscreen')).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => nativeState('is_fullscreen')).toBe(false);
}
