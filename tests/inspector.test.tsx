import { render } from './render';
import { it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { Inspector } from '../src/views/Inspector';

it('records both valid edits and unfinished invalid drafts immediately', () => {
  const edit = vi.fn();
  render(
    <Theme theme={neutralTheme}>
      <Inspector
        line={{ index: 0, raw: '{"a":1}', value: { a: 1 }, parseError: null }}
        editMode
        onClose={() => {}}
        onEdit={edit}
        report={() => {}}
      />
    </Theme>,
  );
  const input = screen.getByRole('textbox', { name: '编辑 JSON' });
  fireEvent.change(input, { target: { value: '{"a":2}' } });
  expect(edit).toHaveBeenLastCalledWith('{"a":2}', { a: 2 }, null);
  fireEvent.change(input, { target: { value: '{"a":' } });
  expect(edit).toHaveBeenLastCalledWith('{"a":', null, expect.any(String));
});

it('shows the original invalid document instead of a synthetic null value', () => {
  const raw = '{\n  "incomplete":';
  const { container } = render(
    <Inspector
      line={{ index: 0, raw, value: null, parseError: 'EOF while parsing a value' }}
      editMode={false}
      onClose={() => {}}
      onEdit={() => {}}
      report={() => {}}
    />,
  );
  expect(container.querySelector('pre code')?.textContent).toBe(raw.replaceAll('\n', ''));
});
