import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { renderHook } from './render';
import { useWorkspace } from '../src/workspace/useWorkspace';
import { api } from '../src/lib/bridge';
import type { Snapshot } from '../src/lib/types';

function snapshot(id: string): Snapshot {
  return {
    id,
    path: `${id}.json`,
    name: `${id}.json`,
    revision: 1,
    sizeBytes: 2,
    totalLines: 1,
    lines: [{ index: 0, raw: '{}', value: {}, parseError: null }],
    hasMore: false,
    trace: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('shows pending opens immediately, deduplicates requests, and clears progress after cancellation', async () => {
  const pending = deferred<Snapshot | null>();
  const open = vi.spyOn(api, 'open').mockReturnValue(pending.promise);
  const { result } = renderHook(() => useWorkspace());
  act(() => {
    void result.current.open('large.json');
    void result.current.open('large.json');
  });
  expect(result.current.opening).toEqual(['large.json']);
  expect(open).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(null));
  expect(result.current.opening).toEqual([]);
  expect(result.current.state.sessions).toEqual([]);
});

it('retains drafts and the user-selected file when a slow open completes', async () => {
  const pending = deferred<Snapshot | null>();
  vi.spyOn(api, 'open')
    .mockResolvedValueOnce(snapshot('first'))
    .mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useWorkspace());
  await act(() => result.current.open('first.json'));
  act(() => {
    void result.current.open('large.json');
  });
  act(() => {
    result.current.edit('first', 0, '{"draft":true}', { draft: true });
    result.current.dispatch({ type: 'activate', id: 'first' });
  });
  await act(async () => pending.resolve(snapshot('large')));
  expect(result.current.state.activeId).toBe('first');
  expect(result.current.active?.edits[0].value).toEqual({ draft: true });
  expect(result.current.state.sessions.map((session) => session.snapshot.id)).toEqual([
    'first',
    'large',
  ]);
  expect(result.current.opening).toEqual([]);
});

it('does not reactivate a document closed while an open response was pending', async () => {
  const pending = deferred<Snapshot | null>();
  vi.spyOn(api, 'open')
    .mockResolvedValueOnce(snapshot('first'))
    .mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useWorkspace());
  await act(() => result.current.open('first.json'));
  act(() => {
    void result.current.open('first.json');
  });
  act(() => result.current.dispatch({ type: 'close', ids: ['first'] }));
  await act(async () => pending.resolve(snapshot('first')));
  expect(result.current.state.sessions).toEqual([]);
  expect(result.current.opening).toEqual([]);
});

it('clears failed opens and lets a later open retry', async () => {
  vi.spyOn(api, 'open')
    .mockRejectedValueOnce(new Error('Could not read file'))
    .mockResolvedValueOnce(snapshot('large'));
  const { result } = renderHook(() => useWorkspace());
  await act(() => result.current.open('large.json'));
  expect(result.current.opening).toEqual([]);
  await act(() => result.current.open('large.json'));
  expect(result.current.active?.snapshot.id).toBe('large');
});
