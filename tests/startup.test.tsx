import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { render } from './render';
import { App } from '../src/App';
import { api, bindNative } from '../src/lib/bridge';

vi.mock('../src/lib/bridge', async (original) => {
  const bridge = await original<typeof import('../src/lib/bridge')>();
  return {
    ...bridge,
    isNative: true,
    bindNative: vi.fn(),
    api: { ...bridge.api, startup: vi.fn(), open: vi.fn(), locale: vi.fn() },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&') });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.mocked(api.locale).mockResolvedValue();
  vi.mocked(api.open).mockResolvedValue(null);
  vi.mocked(api.startup).mockResolvedValue(['launch.jsonl']);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('binds native file listeners before receiving queued launch files', async () => {
  const listeners = deferred<() => void>();
  const dispose = vi.fn();
  vi.mocked(bindNative).mockReturnValue(listeners.promise);
  const app = render(<App />);
  expect(api.startup).not.toHaveBeenCalled();
  await act(async () => listeners.resolve(dispose));
  expect(api.startup).toHaveBeenCalledOnce();
  expect(api.open).toHaveBeenCalledWith('launch.jsonl');
  app.unmount();
  expect(dispose).toHaveBeenCalledOnce();
});

it('disposes late listeners and leaves launch files queued when unmounted before binding', async () => {
  const listeners = deferred<() => void>();
  const dispose = vi.fn();
  vi.mocked(bindNative).mockReturnValue(listeners.promise);
  const app = render(<App />);
  app.unmount();
  await act(async () => listeners.resolve(dispose));
  expect(dispose).toHaveBeenCalledOnce();
  expect(api.startup).not.toHaveBeenCalled();
  expect(api.open).not.toHaveBeenCalled();
});

it('does not open files after unmount while the startup command is pending', async () => {
  const files = deferred<string[]>();
  const dispose = vi.fn();
  vi.mocked(bindNative).mockResolvedValue(dispose);
  vi.mocked(api.startup).mockReturnValue(files.promise);
  const app = render(<App />);
  await act(async () => {});
  expect(api.startup).toHaveBeenCalledOnce();
  app.unmount();
  await act(async () => files.resolve(['late.jsonl']));
  expect(api.open).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});
