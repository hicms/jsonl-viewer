import { render } from './render';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { tableFields, updateHiddenColumns } from '../src/lib/tableColumns';
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

it('retains loaded fields during filtering and applies visibility without hiding reserved controls', () => {
  const lines: Line[] = [
    {
      index: 0,
      value: { name: 'first', 'internal:line': 'user value' },
      raw: '',
      parseError: null,
    },
    { index: 1, value: { other: 'second' }, raw: '', parseError: null },
    { index: 2, value: [1, 2], raw: '', parseError: null },
  ];
  const fields = tableFields(lines);
  const { rerender } = render(
    <TableView fields={fields} hiddenColumns={[]} lines={[lines[0]]} onSelect={() => {}} />,
  );
  expect(screen.getByRole('columnheader', { name: /other/ })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: /值/ })).toBeTruthy();
  expect(screen.getByText('user value')).toBeTruthy();
  const hidden = updateHiddenColumns(['field:unrelated'], fields, ['field:name']);
  expect(hidden).toContain('field:unrelated');
  expect(hidden).toContain('field:internal%3Aline');
  rerender(
    <TableView fields={fields} hiddenColumns={hidden} lines={[lines[0]]} onSelect={() => {}} />,
  );
  expect(screen.queryByRole('columnheader', { name: /other/ })).toBeNull();
  expect(screen.queryByText('user value')).toBeNull();
  expect(screen.getByRole('columnheader', { name: /^行 / })).toBeTruthy();
  expect(screen.getByRole('button', { name: '查看第 1 行' })).toBeTruthy();
  expect(
    updateHiddenColumns(
      hidden,
      fields,
      fields.map((field) => field.id),
    ),
  ).toEqual(['field:unrelated']);
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
      <TableView fields={tableFields([line])} hiddenColumns={[]} lines={[line]} onSelect={select} />
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
  const details = screen.getByRole('complementary', { name: '行详情' });
  expect(details.textContent).toContain('tool response');
  expect(details.textContent!.length).toBeLessThan(30_000);
  expect(details.querySelectorAll('[data-code-row]').length).toBeLessThan(60);
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
      <TableView fields={tableFields(lines)} hiddenColumns={[]} lines={lines} onSelect={() => {}} />
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
