import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { I18nProvider, type Locale } from '../src/i18n';
import { TableView } from '../src/views/TableView';
import { TreeView } from '../src/views/TreeView';
import { TraceView } from '../src/views/TraceView';
import type { FileUi, Line, Trace } from '../src/lib/types';
import type { ReactNode } from 'react';

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
  localStorage.clear();
  vi.unstubAllGlobals();
});

function localized(locale: Locale, child: ReactNode) {
  return (
    <I18nProvider locale={locale}>
      <Theme theme={neutralTheme}>{child}</Theme>
    </I18nProvider>
  );
}
const lines: Line[] = Array.from({ length: 101 }, (_, index) => ({
  index,
  raw: JSON.stringify({ message: `record-${index}`, payload: { nested: index } }),
  value: { message: `record-${index}`, payload: { nested: index } },
  parseError: null,
}));
const traceUi: FileUi = {
  view: 'trace',
  filter: '',
  selected: null,
  editMode: false,
  order: 'oldest',
  wide: false,
  expanded: true,
  follow: false,
  pending: 0,
  live: false,
  changed: false,
};

it('translates Astryx pagination and row expansion while retaining their state and column preferences', () => {
  const view = <TableView lines={lines} onSelect={() => {}} />;
  const { rerender } = render(localized('en', view));
  const first = screen.getByText('record-0').closest('tr')!;
  fireEvent.click(within(first).getByRole('button', { name: 'Expand row' }));
  expect(
    within(first).getByRole('button', { name: 'Collapse row' }).getAttribute('aria-expanded'),
  ).toBe('true');
  expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy();
  rerender(localized('zh-CN', view));
  expect(within(first).getByRole('button', { name: '折叠行' }).getAttribute('aria-expanded')).toBe(
    'true',
  );
  expect(screen.getByRole('button', { name: '复制代码' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '转到下一页' }));
  expect(screen.getByText('record-100')).toBeTruthy();
  rerender(localized('en', view));
  expect(screen.getByText('record-100')).toBeTruthy();
  expect(screen.queryByText('record-0')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));
  expect(
    within(screen.getByText('record-0').closest('tr')!)
      .getByRole('button', { name: 'Collapse row' })
      .getAttribute('aria-expanded'),
  ).toBe('true');
}, 15000);

it('retains manually expanded tree nodes and pagination when changing language', () => {
  const view = <TreeView lines={lines} onSelect={() => {}} />;
  const { rerender } = render(localized('en', view));
  const first = screen.getAllByRole('treeitem')[0];
  fireEvent.click(within(first).getByRole('button', { name: 'Toggle children' }));
  expect(first.getAttribute('aria-expanded')).toBe('true');
  rerender(localized('zh-CN', view));
  expect(screen.getAllByRole('treeitem')[0]).toBe(first);
  expect(first.getAttribute('aria-expanded')).toBe('true');
  expect(first.textContent).toContain('第 1 行');
  expect(first.textContent).toContain('对象');
  fireEvent.click(screen.getByRole('button', { name: '转到下一页' }));
  expect(screen.getByText('第 101 行 · 对象 (2)')).toBeTruthy();
  rerender(localized('en', view));
  expect(screen.getByText('Line 101 · Object (2)')).toBeTruthy();
});

it('localizes generated session presentation and dates while retaining source content and source titles', () => {
  const trace: Trace = {
    format: 'codex',
    harness: 'Codex',
    title: null,
    id: 'session',
    cwd: null,
    model: 'model-id',
    traceType: 'main',
    parentThreadId: null,
    reasoningEffort: null,
    efforts: [],
    stats: {
      messages: 0,
      toolCalls: 0,
      toolResults: 0,
      errors: 1,
      inputTokens: 0,
      outputTokens: 0,
    },
    items: [
      {
        kind: 'event',
        role: 'system',
        sourceLine: 0,
        sourceLines: [0],
        timestamp: '2026-01-01T10:00:00Z',
        model: null,
        provider: null,
        effort: null,
        label: null,
        eventType: 'turn_aborted',
        usage: null,
        searchText: 'original message',
        blocks: [
          { kind: 'thinking', redacted: true, sourceLine: 0 },
          { kind: 'text', text: 'original message 用户内容', sourceLine: 0 },
        ],
      },
    ],
  };
  const view = (locale: Locale, value = trace) =>
    localized(
      locale,
      <TraceView trace={value} ui={traceUi} onUi={() => {}} onRelated={() => {}} />,
    );
  const { rerender } = render(view('en'));
  expect(screen.getByText('Codex session')).toBeTruthy();
  expect(screen.getByText('Turn aborted')).toBeTruthy();
  expect(screen.getByText('Reasoning unavailable (redacted)')).toBeTruthy();
  const withMessage = {
    ...trace,
    items: [
      ...trace.items,
      {
        ...trace.items[0],
        kind: 'assistant',
        sourceLine: 1,
        eventType: undefined,
        blocks: [{ kind: 'text' as const, text: 'timestamped message', sourceLine: 1 }],
      },
    ],
  };
  rerender(view('en', withMessage));
  expect(
    screen.getByText(new Date(trace.items[0].timestamp!).toLocaleTimeString('en')),
  ).toBeTruthy();
  rerender(view('zh-CN'));
  expect(screen.getByText('Codex 会话')).toBeTruthy();
  expect(screen.getByText('回合已中止')).toBeTruthy();
  expect(screen.getByText('思考内容不可用（已隐藏）')).toBeTruthy();
  expect(screen.getByText('original message 用户内容')).toBeTruthy();
  rerender(view('en', { ...trace, title: '用户标题' }));
  expect(screen.getByText('用户标题')).toBeTruthy();
});
