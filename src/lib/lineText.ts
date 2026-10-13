import type { Line } from './types';
import { stringify } from './preferences';

const formatted = new WeakMap<object, string>();

export function lineText(line: Line, raw = false): string {
  if (raw || line.parseError) return line.raw;
  const value = line.value;
  if (value === null || typeof value !== 'object') return stringify(value, true);
  let text = formatted.get(value);
  if (text === undefined) {
    text = stringify(value, true);
    formatted.set(value, text);
  }
  return text;
}
