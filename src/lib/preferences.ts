import { useState } from 'react';

export function usePreference<T>(key: string, initial: T) {
  const name = `jsonl-viewer:2:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(name);
      return stored === null ? initial : (JSON.parse(stored) as T);
    } catch {
      return initial;
    }
  });
  function update(next: T | ((previous: T) => T)) {
    setValue((previous) => {
      const result = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
      try {
        localStorage.setItem(name, JSON.stringify(result));
      } catch {
        /* Storage can be unavailable in private profiles. */
      }
      return result;
    });
  }
  return [value, update] as const;
}
export function bytes(size: number) {
  return size < 1024
    ? `${size} B`
    : size < 1024 ** 2
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1024 ** 2).toFixed(1)} MB`;
}
export function stringify(value: unknown, pretty = false) {
  return typeof value === 'string' && !pretty
    ? value
    : (JSON.stringify(value, null, pretty ? 2 : undefined) ?? '');
}
