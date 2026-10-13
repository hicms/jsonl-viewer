import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWindowChrome } from '../src/lib/useWindowChrome';

const native = vi.hoisted(() => ({
  isDecorated: vi.fn(),
  isMaximized: vi.fn(),
  isFullscreen: vi.fn(),
  onResized: vi.fn(),
  setFullscreen: vi.fn(),
  close: vi.fn(),
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => native }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  native.isDecorated.mockResolvedValue(false);
  native.isMaximized.mockResolvedValue(false);
  native.isFullscreen.mockResolvedValue(false);
  native.onResized.mockResolvedValue(vi.fn());
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('leaves decorated platforms unchanged', async () => {
  native.isDecorated.mockResolvedValue(true);
  const { result } = renderHook(() => useWindowChrome(vi.fn()));
  await act(async () => {});
  expect(result.current.custom).toBe(false);
  expect(native.onResized).not.toHaveBeenCalled();
});

it('removes a resize listener that resolves after unmount', async () => {
  const registration = deferred<() => void>();
  const dispose = vi.fn();
  native.onResized.mockReturnValue(registration.promise);
  const hook = renderHook(() => useWindowChrome(vi.fn()));
  await act(async () => {});
  hook.unmount();
  await act(async () => registration.resolve(dispose));
  expect(dispose).toHaveBeenCalledOnce();
  expect(native.isMaximized).not.toHaveBeenCalled();
});

it('ignores an older resize response after a newer window state', async () => {
  const old = deferred<boolean>();
  native.isMaximized.mockReturnValueOnce(old.promise).mockResolvedValue(true);
  const { result } = renderHook(() => useWindowChrome(vi.fn()));
  await act(async () => {});
  await act(async () => native.onResized.mock.calls[0][0]());
  expect(result.current.maximized).toBe(true);
  await act(async () => old.resolve(false));
  expect(result.current.maximized).toBe(true);
});

it('restores fullscreen on mount and gives Escape priority without dismissing dialogs', async () => {
  native.isFullscreen.mockResolvedValue(true);
  const { result } = renderHook(() => useWindowChrome(vi.fn()));
  await act(async () => {});
  expect(result.current.fullscreen).toBe(true);
  const dialog = vi.fn();
  document.addEventListener('keydown', dialog);
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await act(async () => {
    document.dispatchEvent(escape);
  });
  expect(escape.defaultPrevented).toBe(true);
  expect(dialog).not.toHaveBeenCalled();
  expect(native.setFullscreen).toHaveBeenCalledWith(false);
  native.isFullscreen.mockResolvedValue(false);
  await act(async () => native.onResized.mock.calls[0][0]());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(dialog).toHaveBeenCalledOnce();
  document.removeEventListener('keydown', dialog);
});

it('serializes window actions and reports errors without destroying the window', async () => {
  const close = deferred<void>();
  native.close.mockReturnValue(close.promise);
  const report = vi.fn();
  const { result } = renderHook(() => useWindowChrome(report));
  await act(async () => {});
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.run('close');
    await result.current.run('close');
  });
  expect(native.close).toHaveBeenCalledOnce();
  await act(async () => {
    close.resolve();
    await pending;
  });
  native.minimize.mockRejectedValue(new Error('window unavailable'));
  await act(async () => result.current.run('minimize'));
  expect(report).toHaveBeenCalledWith(new Error('window unavailable'));
});
