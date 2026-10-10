import { render, renderHook } from './render';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { Explorer } from '../src/components/Explorer';
import { useWorkspace } from '../src/workspace/useWorkspace';
import { api } from '../src/lib/bridge';
import type { Snapshot } from '../src/lib/types';

const historyKey = 'jsonl-viewer:2:recent';
const paths = Array.from({ length: 50 }, (_, index) => `C:/data/file-${index}.jsonl`);
const snapshot = (path: string): Snapshot => ({
  id: path,
  path,
  name: path.split('/').at(-1)!,
  revision: 1,
  sizeBytes: 0,
  totalLines: 0,
  hasMore: false,
  trace: null,
  lines: [],
});

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(api, 'open').mockImplementation(async (path) => snapshot(path!));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it('retains the latest 50 unique successful opens across remounts', async () => {
  localStorage.setItem(historyKey, JSON.stringify(paths));
  const { result, unmount } = renderHook(() => useWorkspace());
  await act(() => result.current.open('C:/data/new.jsonl'));
  expect(result.current.recent).toEqual(['C:/data/new.jsonl', ...paths.slice(0, 49)]);
  await act(() => result.current.open(paths[20]));
  expect(result.current.recent).toHaveLength(50);
  expect(result.current.recent[0]).toBe(paths[20]);
  expect(new Set(result.current.recent).size).toBe(50);
  const expected = result.current.recent;
  unmount();
  expect(renderHook(() => useWorkspace()).result.current.recent).toEqual(expected);
});

it('shows 5 history entries, expands to 50 and removes only the chosen history item', () => {
  localStorage.setItem(historyKey, JSON.stringify(paths));
  function Harness() {
    const workspace = useWorkspace();
    return (
      <Theme theme={neutralTheme}>
        <Explorer
          workspace={workspace}
          onSources={() => {}}
          onFolderReady={() => {}}
          onClose={() => {}}
        />
      </Theme>
    );
  }
  const { unmount } = render(<Harness />);
  const recent = screen.getByRole('region', { name: '最近文件' });
  expect(within(recent).getAllByRole('button', { name: /^file-\d+\.jsonl$/ })).toHaveLength(5);
  fireEvent.click(within(recent).getByRole('button', { name: /显示更多/ }));
  expect(within(recent).getAllByRole('button', { name: /^file-\d+\.jsonl$/ })).toHaveLength(50);
  fireEvent.click(within(recent).getByRole('button', { name: '收起' }));
  expect(within(recent).getAllByRole('button', { name: /^file-\d+\.jsonl$/ })).toHaveLength(5);
  expect(within(recent).queryByRole('button', { name: '清空最近文件' })).toBeNull();
  fireEvent.click(within(recent).getByRole('button', { name: '移除历史 file-2.jsonl' }));
  expect(within(recent).queryByRole('button', { name: 'file-2.jsonl' })).toBeNull();
  expect(within(recent).getByRole('button', { name: 'file-5.jsonl' })).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(historyKey)!)).toEqual(
    paths.filter((path) => path !== paths[2]),
  );
  expect(api.open).not.toHaveBeenCalled();
  unmount();
  render(<Harness />);
  expect(screen.queryByRole('button', { name: 'file-2.jsonl' })).toBeNull();
  expect(screen.getByRole('button', { name: 'file-5.jsonl' })).toBeTruthy();
});

it('requests closing the sidebar file without activating it', async () => {
  const onClose = vi.fn();
  let workspace: ReturnType<typeof useWorkspace>;
  function Harness() {
    workspace = useWorkspace();
    return (
      <Theme theme={neutralTheme}>
        <Explorer
          workspace={workspace}
          onSources={() => {}}
          onFolderReady={() => {}}
          onClose={onClose}
        />
      </Theme>
    );
  }
  render(<Harness />);
  await act(() => workspace.open(paths[0]));
  await act(() => workspace.open(paths[1]));
  fireEvent.click(screen.getByRole('button', { name: '关闭 file-0.jsonl' }));
  expect(onClose).toHaveBeenCalledWith(paths[0]);
  expect(workspace!.state.activeId).toBe(paths[1]);
  expect(workspace!.state.sessions).toHaveLength(2);
});
