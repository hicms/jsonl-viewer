import { expect, it } from 'vitest';
import {
  CODE_ROW_LENGTH,
  CODE_ROW_HEIGHT,
  MAX_CODE_SCROLL_HEIGHT,
  indexCode,
  codeRow,
  codeWindow,
} from '../src/lib/codeWindow';

it('indexes every character without splitting surrogate pairs or losing line endings', () => {
  const code = '\uFEFF' + 'x'.repeat(CODE_ROW_LENGTH - 2) + '😀\r\n\n' + 'y'.repeat(1200) + '\n';
  const offsets = indexCode(code);
  const slices = Array.from({ length: offsets.length - 1 }, (_, row) =>
    code.slice(offsets[row], offsets[row + 1]),
  );
  expect(slices.join('')).toBe(code);
  expect(slices.every((part) => part.length <= CODE_ROW_LENGTH)).toBe(true);
  expect(slices.some((part) => /[\uD800-\uDBFF]$/.test(part))).toBe(false);
  expect(codeRow(code, offsets, offsets.length - 2)).toBe('');
  expect(indexCode('')).toEqual(Uint32Array.of(0, 0));
  expect(codeRow('a\r\n', indexCode('a\r\n'), 0)).toBe('a');
});

it('bounds a million-line viewport and reaches the exact last row within browser height limits', () => {
  const count = 1_156_727;
  for (const top of [0, 4000, MAX_CODE_SCROLL_HEIGHT / 2, MAX_CODE_SCROLL_HEIGHT]) {
    const window = codeWindow(count, top, 640);
    expect(window.height).toBe(MAX_CODE_SCROLL_HEIGHT);
    expect(window.end - window.start).toBeLessThanOrEqual(49);
    expect(window.start).toBeGreaterThanOrEqual(0);
    expect(window.end).toBeLessThanOrEqual(count);
  }
  const bottom = codeWindow(count, MAX_CODE_SCROLL_HEIGHT, 640);
  expect(bottom.end).toBe(count);
  expect(bottom.top + (bottom.end - bottom.start) * CODE_ROW_HEIGHT).toBe(MAX_CODE_SCROLL_HEIGHT);
  expect(codeWindow(2, 500, 640)).toEqual({ start: 0, end: 2, height: 40, top: 0 });
});

it('bounds a minified multi-megabyte line while keeping its final characters reachable', () => {
  const code = 'a'.repeat(2_000_000) + 'end';
  const offsets = indexCode(code);
  expect(offsets.length).toBe(Math.ceil(code.length / CODE_ROW_LENGTH) + 1);
  expect(codeRow(code, offsets, offsets.length - 2)).toMatch(/end$/);
});

it('shares the browser height budget across many expanded records without losing their tails', () => {
  const limit = MAX_CODE_SCROLL_HEIGHT / 100;
  const windows = Array.from({ length: 100 }, () => codeWindow(1_156_727, limit, 640, limit));
  expect(windows.reduce((height, window) => height + window.height, 0)).toBe(
    MAX_CODE_SCROLL_HEIGHT,
  );
  for (const window of windows) {
    expect(window.end).toBe(1_156_727);
    expect(window.end - window.start).toBeLessThan(60);
    expect(window.top + (window.end - window.start) * CODE_ROW_HEIGHT).toBe(limit);
  }
});

it('wraps long lines to the available columns including Unicode and tabs without dropping text', () => {
  const code = 'ASCII '.repeat(100) + '中文😀'.repeat(60) + '\t'.repeat(40) + '\r\nend';
  for (const columns of [24, 40, 80, 120]) {
    const offsets = indexCode(code, columns);
    const slices = Array.from({ length: offsets.length - 1 }, (_, row) =>
      code.slice(offsets[row], offsets[row + 1]),
    );
    expect(slices.join('')).toBe(code);
    for (let row = 0; row < slices.length; row++) {
      let width = 0;
      for (const char of codeRow(code, offsets, row))
        width += char === '\t' ? 2 - (width % 2) : char.codePointAt(0)! > 127 ? 2 : 1;
      expect(width).toBeLessThanOrEqual(columns);
    }
  }
});
