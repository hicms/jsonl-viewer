import { expect, it } from 'vitest';
import { jsonPreview, PREVIEW_LENGTH } from '../src/lib/jsonPreview';
import type { Json } from '../src/lib/types';

it('keeps a bounded overview without changing long source content', () => {
  const text = 'agent output '.repeat(5000);
  const value = { message: text, flag: false, count: 0 };
  expect(jsonPreview(text)).toHaveLength(PREVIEW_LENGTH);
  expect(jsonPreview(text)).toMatch(/…$/);
  expect(jsonPreview(value).length).toBeLessThanOrEqual(PREVIEW_LENGTH);
  expect(value.message).toBe(text);
  expect(jsonPreview(null)).toBe('null');
  expect(jsonPreview(undefined)).toBe('');
  expect(jsonPreview(false)).toBe('false');
  expect(jsonPreview(0)).toBe('0');
});

it('does not traverse nested tool payloads or serialize the whole container', () => {
  const nested = Object.defineProperty({}, 'output', {
    enumerable: true,
    get() {
      throw new Error('A collapsed preview must not visit this payload');
    },
  }) as Json;
  const value = { content: [nested], metadata: nested };
  expect(jsonPreview(value)).toBe('{content: 数组 (1), metadata: 对象 (1)}');
  expect(jsonPreview([nested])).toBe('[对象 (1)] (1)');
});

it('only reads the first preview fields and leaves later fields for details', () => {
  const value = Object.defineProperty({ a: 1, b: 2, c: 3 }, 'later', {
    enumerable: true,
    get() {
      throw new Error('Only visible preview fields may be read');
    },
  });
  expect(jsonPreview(value)).toBe('{a: 1, b: 2, c: 3, …}');
});
