import { expect, it } from 'vitest';
import { tableFields } from '../src/lib/tableColumns';

it('retains a value column for invalid documents so the parse error is visible', () => {
  expect(tableFields([{ index: 0, raw: '{', value: null, parseError: 'EOF' }])).toEqual([
    { id: 'internal:value', key: null },
  ]);
  expect(tableFields([])).toEqual([]);
});
