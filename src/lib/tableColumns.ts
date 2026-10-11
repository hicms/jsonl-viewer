import type { Line } from './types';

export type TableField = { id: string; key: string | null };

export function tableFields(lines: Line[]): TableField[] {
  const keys = new Set<string>();
  let hasValue = false;
  for (const line of lines) {
    if (line.parseError) continue;
    if (line.value && typeof line.value === 'object' && !Array.isArray(line.value)) {
      for (const key of Object.keys(line.value)) keys.add(key);
    } else hasValue = true;
  }
  return [
    ...Array.from(keys, (key) => ({ id: `field:${encodeURIComponent(key)}`, key })),
    ...(hasValue ? [{ id: 'internal:value', key: null }] : []),
  ];
}

export function updateHiddenColumns(hidden: string[], fields: TableField[], visible: string[]) {
  const currentIds = new Set(fields.map((field) => field.id));
  return [
    ...hidden.filter((id) => !currentIds.has(id)),
    ...fields.filter((field) => !visible.includes(field.id)).map((field) => field.id),
  ];
}
