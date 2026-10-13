import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setZoom, openPreferences, closeNavigation } from './layout-native.mjs';

export async function verifyTitlebar({ page, directory, artifacts, openFile, processId }) {
  const probe = (action = 'state') =>
    JSON.parse(
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
        { encoding: 'utf8', windowsHide: true },
      ),
    );
  const nativeState = (command) =>
    page.evaluate(
      (name) => window.__TAURI_INTERNALS__.invoke(`plugin:window|${name}`, { label: 'main' }),
      command,
    );
  async function expectMinimized() {
    try {
      await expect.poll(() => probe()).toMatchObject({ minimized: true });
    } catch (error) {
      console.log('Minimize failure diagnostics', {
        native: probe(),
        tauriMinimized: await nativeState('is_minimized'),
        pointer: await page.evaluate(() => window.__captionPointer),
        controls: await page.locator('.window-controls').evaluate((element) => element.outerHTML),
      });
      await nativeState('minimize');
      console.log('Direct native minimize result', probe());
      throw error;
    }
  }
  expect(await nativeState('is_decorated')).toBe(false);
  await page.evaluate(() =>
    window.addEventListener(
      'mousedown',
      (event) => {
        window.__captionPointer = {
          x: event.clientX,
          y: event.clientY,
          target: event.target.outerHTML.slice(0, 240),
        };
      },
      true,
    ),
  );
  const before = probe();
  const after = probe('drag');
  const pointer = await page.evaluate(() => window.__captionPointer);
  const unavailableDesktop =
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.RUNNER_ENVIRONMENT === 'github-hosted' &&
    !after.foreground &&
    !pointer;
  if (unavailableDesktop)
    console.log('Physical titlebar drag unavailable: hosted runner has no foreground desktop', {
      before,
      after,
    });
  else
    await expect
      .poll(() => {
        const current = probe();
        return [current.left, current.top];
      })
      .not.toEqual([before.left, before.top]);
  const caption = page.locator('.window-titlebar');
  const controls = page.locator('.window-controls');
  const file = path.join(directory, 'caption.jsonl');
  const original =
    Array.from({ length: 1201 }, (_, id) => JSON.stringify({ id })).join('\n') + '\n';
  writeFileSync(file, original);
  await openFile(file);
  await expect(page.getByRole('heading', { name: 'caption.jsonl', exact: true })).toBeVisible();
  for (const mode of ['浅色', '深色']) {
    for (const zoom of [80, 100, 150]) {
      await page.setViewportSize({ width: 1280, height: 840 });
      await openPreferences(page);
      await page.getByRole('combobox', { name: '主题模式', exact: true }).click();
      await page.getByRole('option', { name: mode, exact: true }).click();
      await setZoom(page, zoom);
      for (const width of [720, 1280]) {
        await closeNavigation(page);
        await page.setViewportSize({ width, height: 840 });
        await expect
          .poll(async () => Math.round((await caption.boundingBox())?.height ?? 0))
          .toBe(40);
        await expect
          .poll(async () => {
            const box = await controls.boundingBox();
            return (
              box && [Math.round(box.x + box.width), Math.round(box.y), Math.round(box.height)]
            );
          })
          .toEqual([width, 0, 40]);
        await page.getByRole('button', { name: '查看第 1 行', exact: true }).click();
        const panel = page.getByRole('complementary', { name: '行详情' });
        await expect.poll(async () => Math.round((await panel.boundingBox()).y)).toBe(40);
        await page.getByRole('button', { name: '最大化窗口', exact: true }).click({ trial: true });
        await panel.getByRole('button', { name: '关闭详情', exact: true }).click();
        if (width === 720) {
          await page.getByRole('button', { name: '打开导航', exact: true }).click();
          await expect(page.locator('dialog:modal .window-controls')).toHaveCount(1);
          await expect
            .poll(async () => {
              const box = await controls.boundingBox();
              return (
                box && [Math.round(box.x + box.width), Math.round(box.y), Math.round(box.height)]
              );
            })
            .toEqual([width, 0, 40]);
          await page.getByRole('button', { name: '最小化窗口', exact: true }).click();
          await expectMinimized();
          probe('restore');
          await expect.poll(() => probe()).toMatchObject({ minimized: false });
          await closeNavigation(page);
        }
        if (zoom === 100) {
          await page.mouse.move(300, 20);
          await expect(page.getByRole('tooltip')).toHaveCount(0);
          await page.screenshot({ path: path.join(artifacts, `titlebar-${mode}-${width}.png`) });
        }
      }
    }
  }
  await setZoom(page, 100);
  await closeNavigation(page);
  await page.setViewportSize({ width: 1280, height: 840 });
  expect(probe().topHit).toBe(12); // HTTOP: native edge resizing remains available.
  await page.getByRole('button', { name: '最大化窗口', exact: true }).click();
  await expect(page.getByRole('button', { name: '还原窗口', exact: true })).toBeVisible();
  await expect.poll(() => probe()).toMatchObject({ maximized: true });
  await page.getByRole('button', { name: '还原窗口', exact: true }).click();
  await expect.poll(() => nativeState('is_maximized')).toBe(false);
  // The second mousedown exercises Tauri's real double-click handler without an OS drag loop.
  await caption.dispatchEvent('mousedown', { button: 0, detail: 2 });
  await expect.poll(() => nativeState('is_maximized')).toBe(true);
  await caption.dispatchEvent('mousedown', { button: 0, detail: 2 });
  await expect.poll(() => nativeState('is_maximized')).toBe(false);

  await page.keyboard.press('F11');
  await expect.poll(() => nativeState('is_fullscreen')).toBe(true);
  await expect(caption).toBeHidden();
  await page.reload();
  await expect(page.locator('.app-root')).toHaveAttribute('data-fullscreen', 'true');
  await page.keyboard.press('Escape');
  await expect.poll(() => nativeState('is_fullscreen')).toBe(false);
  await expect(caption).toBeVisible();
  for (const zoom of [80, 150, 100]) {
    await setZoom(page, zoom);
    await closeNavigation(page);
    // Open native modals in reverse DOM order, as a late lazy dialog can do.
    await page.evaluate(() => {
      const root = document.querySelector('.app-root');
      for (const id of ['caption-first', 'caption-second']) {
        const dialog = document.createElement('dialog');
        dialog.id = id;
        dialog.textContent = id;
        root.append(dialog);
      }
      document.querySelector('#caption-second').showModal();
    });
    await expect(page.locator('#caption-second .window-controls')).toHaveCount(1);
    await page.evaluate(() => {
      const first = document.querySelector('#caption-first');
      first.style.transform = 'translate(30px, 20px) scale(0.9)';
      first.showModal();
    });
    await expect(page.locator('#caption-first .window-controls')).toHaveCount(1);
    await expect
      .poll(async () => {
        const box = await controls.boundingBox();
        return box && [Math.round(box.x + box.width), Math.round(box.y), Math.round(box.height)];
      })
      .toEqual([1280, 0, 40]);
    await page.getByRole('button', { name: '最小化窗口', exact: true }).click();
    await expectMinimized();
    probe('restore');
    await expect.poll(() => probe()).toMatchObject({ minimized: false });
    await page.evaluate(() => document.querySelector('#caption-first').remove());
    await expect(page.locator('#caption-second .window-controls')).toHaveCount(1);
    await page.evaluate(() => document.querySelector('#caption-second').remove());
    await expect(caption.locator('.window-controls')).toHaveCount(1);
  }
  await openFile(file);
  await page.getByRole('button', { name: '查看第 1 行', exact: true }).click();
  await page
    .getByRole('complementary', { name: '行详情' })
    .getByRole('button', { name: '编辑', exact: true })
    .click();
  const input = page.getByRole('textbox', { name: '编辑 JSON' });
  const draft = '{"id":0,"caption":"saved"}';
  await input.fill(draft);
  for (const close of [
    () => page.getByRole('button', { name: '关闭窗口', exact: true }).click(),
    () => probe('close'),
  ]) {
    await close();
    await expect(page.getByText('放弃未保存的修改？', { exact: true })).toBeVisible();
    await expect(page.locator('dialog:modal .window-controls')).toHaveCount(1);
    await page.getByRole('button', { name: '最小化窗口', exact: true }).click();
    await expectMinimized();
    probe('restore');
    await expect.poll(() => probe()).toMatchObject({ minimized: false });
    await page.getByRole('button', { name: '继续编辑', exact: true }).click();
    await expect(input).toHaveValue(draft);
    expect(readFileSync(file, 'utf8')).toBe(original);
  }
  await page
    .getByRole('complementary', { name: '行详情' })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await expect
    .poll(() => readFileSync(file, 'utf8'))
    .toBe(draft + original.slice(original.indexOf('\n')));
  await page.screenshot({ path: path.join(artifacts, 'titlebar-saved-inspector.png') });
  return { physicalDrag: unavailableDesktop ? 'unavailable' : 'passed' };
}
