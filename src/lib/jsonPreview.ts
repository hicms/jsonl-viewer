import type { Json } from './types';

export const PREVIEW_LENGTH = 240;

function clip(text: string, limit: number) {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function summary(value: Json | undefined): string {
  if (value === undefined) return '';
  if (value === null || typeof value !== 'object') return clip(String(value), 60);
  return Array.isArray(value) ? `数组 (${value.length})` : `对象 (${Object.keys(value).length})`;
}

// Overview cells only read one level; details retain the original JSON value.
export function jsonPreview(value: Json | undefined): string {
  if (value === undefined) return '';
  if (value === null || typeof value !== 'object') return clip(String(value), PREVIEW_LENGTH);
  if (Array.isArray(value)) {
    const entries = value.slice(0, 3).map(summary);
    if (value.length > 3) entries.push('…');
    return clip(`[${entries.join(', ')}] (${value.length})`, PREVIEW_LENGTH);
  }
  const keys = Object.keys(value);
  const entries = keys.slice(0, 3).map((key) => `${clip(key, 40)}: ${summary(value[key])}`);
  if (keys.length > 3) entries.push('…');
  return clip(`{${entries.join(', ')}}`, PREVIEW_LENGTH);
}
