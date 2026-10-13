import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from './render';
import { JsonCode } from '../src/components/JsonCode';
import { lineText } from '../src/lib/lineText';
import type { Line } from '../src/lib/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('mounts only a viewport, scrolls to the tail and copies the complete original including CRLF', async () => {
  const code = Array.from({ length: 12000 }, (_, i) => `record ${i}`).join('\r\n') + '\r\n';
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const { container, rerender } = render(<JsonCode code={code} />);
  const viewport = screen.getByRole('region', { name: 'JSON 内容' });
  expect(container.querySelectorAll('[data-code-row]').length).toBeLessThan(60);
  expect(container.textContent).toContain('record 0');
  expect(container.textContent).not.toContain('record 11999');
  fireEvent.scroll(viewport, { target: { scrollTop: 240020 } });
  expect(container.textContent).toContain('record 11999');
  fireEvent.click(screen.getByRole('button', { name: '复制 JSON' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(code));
  rerender(<JsonCode code={'next\n'.repeat(30000)} />);
  expect(viewport.scrollTop).toBe(0);
  expect(container.textContent).not.toContain('record');
  expect(container.textContent).toContain('next');
});

it('also bounds documents with thousands of short lines below the character limit', () => {
  const { container } = render(<JsonCode code={'0\n'.repeat(10000)} />);
  expect(container.querySelectorAll('[data-code-row]').length).toBeLessThan(60);
});

it('uses its parent scroll position for expanded content, including zoom and offscreen records', () => {
  const code = Array.from({ length: 12000 }, (_, i) => `record ${i}`).join('\n');
  const { container } = render(
    <div className="test-scroll-parent">
      <JsonCode code={code} scrollParent=".test-scroll-parent" />
    </div>,
  );
  const parent = container.querySelector<HTMLElement>('.test-scroll-parent')!;
  const flow = container.querySelector<HTMLElement>('.virtual-code-flow')!;
  flow.style.setProperty('--app-zoom', '1.5');
  Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 600 });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(
      0,
      this.classList.contains('virtual-code-track') ? (100 - parent.scrollTop) * 1.5 : 0,
      900,
      900,
    );
  });
  fireEvent.scroll(parent, { target: { scrollTop: 240000 } });
  expect(container.textContent).toContain('record 11999');
  expect(flow.scrollTop).toBe(0);
  expect(container.querySelectorAll('[data-code-row]').length).toBeLessThan(60);
  fireEvent.scroll(parent, { target: { scrollTop: 250000 } });
  expect(container.querySelectorAll('[data-code-row]').length).toBe(0);
  fireEvent.scroll(parent, { target: { scrollTop: 0 } });
  expect(container.textContent).toContain('record 0');
});

it('reuses formatted values without returning stale edits or changing original text', () => {
  const line: Line = { index: 0, value: { a: [1, 2] }, raw: ' {"a":[1,2]}\r\n', parseError: null };
  const serialize = vi.spyOn(JSON, 'stringify');
  const first = lineText(line);
  expect(lineText({ ...line })).toBe(first);
  expect(serialize).toHaveBeenCalledTimes(1);
  expect(lineText(line, true)).toBe(line.raw);
  expect(lineText({ ...line, value: { a: [3] } })).toContain('3');
  expect(lineText({ ...line, parseError: 'Invalid JSON', raw: '{' })).toBe('{');
});
