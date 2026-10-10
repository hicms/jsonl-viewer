import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { TableView } from '../src/views/TableView';
import { Inspector } from '../src/views/Inspector';
import type { Line } from '../src/lib/types';
import { PREVIEW_LENGTH } from '../src/lib/jsonPreview';

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

it('renders long Agent values without measuring truncation for every cell', () => {
  const text = 'tool response '.repeat(5000);
  const line: Line = {
    index: 7,
    value: { message: text, payload: { content: [text] }, 'internal:line': 'real field' },
    raw: '',
    parseError: null,
  };
  const range = vi.spyOn(document, 'createRange');
  const select = vi.fn();
  const { container, rerender } = render(
    <Theme theme={neutralTheme}>
      <TableView lines={[line]} onSelect={select} />
    </Theme>,
  );
  expect(range).not.toHaveBeenCalled();
  expect(container.querySelector('tbody')!.textContent!.length).toBeLessThan(PREVIEW_LENGTH * 2);
  expect(screen.getByText('real field')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '查看第 8 行' }));
  expect(select).toHaveBeenCalledWith(7);
  rerender(
    <Theme theme={neutralTheme}>
      <Inspector
        line={line}
        editMode={false}
        onClose={() => {}}
        onEdit={() => {}}
        report={() => {}}
      />
    </Theme>,
  );
  expect(screen.getByRole('complementary', { name: '行详情' }).textContent).toContain(text);
  expect(line.value).toEqual({
    message: text,
    payload: { content: [text] },
    'internal:line': 'real field',
  });
});

it('shares the row context menu while expanding the right record', async () => {
  const lines: Line[] = [0, 1].map((index) => ({
    index,
    value: { message: `record-${index}`, details: { value: index } },
    raw: '',
    parseError: null,
  }));
  render(
    <Theme theme={neutralTheme}>
      <TableView lines={lines} onSelect={() => {}} />
    </Theme>,
  );
  const second = screen.getByText('record-1');
  fireEvent.contextMenu(second, { clientX: 100, clientY: 100 });
  const menu = await screen.findByRole('menu', { name: '行操作' });
  fireEvent.click(within(menu).getByRole('menuitem', { name: '展开行' }));
  const row = second.closest('tr')!;
  expect(
    within(row)
      .getByRole('button', { name: /Collapse row|折叠行/ })
      .getAttribute('aria-expanded'),
  ).toBe('true');
  expect(
    within(screen.getByText('record-0').closest('tr')!)
      .getByRole('button', { name: /Expand row|展开行/ })
      .getAttribute('aria-expanded'),
  ).toBe('false');
  fireEvent.contextMenu(second, { clientX: 100, clientY: 100 });
  fireEvent.click(
    within(await screen.findByRole('menu', { name: '行操作' })).getByRole('menuitem', {
      name: '折叠行',
    }),
  );
  expect(
    within(row)
      .getByRole('button', { name: /Expand row|展开行/ })
      .getAttribute('aria-expanded'),
  ).toBe('false');
  const first = screen.getByText('record-0');
  fireEvent.touchStart(first, { touches: [{ clientX: 100, clientY: 100 }] });
  const touchMenu = await screen.findByRole('menu', { name: '行操作' });
  fireEvent.click(within(touchMenu).getByRole('menuitem', { name: '展开行' }));
  expect(
    within(first.closest('tr')!)
      .getByRole('button', { name: /Collapse row|折叠行/ })
      .getAttribute('aria-expanded'),
  ).toBe('true');
  expect(
    within(row)
      .getByRole('button', { name: /Expand row|展开行/ })
      .getAttribute('aria-expanded'),
  ).toBe('false');
});
