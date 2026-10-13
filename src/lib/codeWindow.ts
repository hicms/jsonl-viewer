export const CODE_ROW_HEIGHT = 20;
export const CODE_ROW_LENGTH = 512;
export const MAX_CODE_SCROLL_HEIGHT = 8_000_000;
const OVERSCAN = 8;

// Offsets retain the source text, including CRLF and soft line breaks.
export function indexCode(code: string, columns = CODE_ROW_LENGTH): Uint32Array {
  const offsets = [0];
  let start = 0;
  let width = 0;
  const limit = Math.max(1, columns);
  for (let offset = 0; offset < code.length;) {
    const char = code.charCodeAt(offset);
    if (char === 10 || (char === 13 && code.charCodeAt(offset + 1) === 10)) {
      offset += char === 13 ? 2 : 1;
      offsets.push(offset);
      start = offset;
      width = 0;
      continue;
    }
    // Code fonts use one cell for ASCII, two for wide glyphs, and two-cell tab stops.
    const cells = char === 9 ? 2 - (width % 2) : char > 127 ? 2 : 1;
    if (width + cells > limit && offset > start) {
      offsets.push(offset);
      start = offset;
      width = 0;
      continue;
    }
    const next = code.charCodeAt(offset + 1);
    offset += char >= 0xd800 && char <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? 2 : 1;
    width += cells;
  }
  if (offsets.at(-1) !== code.length || !code.length || code.endsWith('\n'))
    offsets.push(code.length);
  return Uint32Array.from(offsets);
}

export function codeWindow(
  count: number,
  scrollTop: number,
  viewport: number,
  heightLimit = MAX_CODE_SCROLL_HEIGHT,
) {
  const height = Math.min(count * CODE_ROW_HEIGHT, heightLimit);
  const maxScroll = Math.max(0, height - viewport);
  const top = Math.min(Math.max(0, scrollTop), maxScroll);
  const offset = maxScroll
    ? (top / maxScroll) * Math.max(0, count * CODE_ROW_HEIGHT - viewport)
    : 0;
  const start = Math.max(0, Math.floor(offset / CODE_ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(count, Math.ceil((offset + viewport) / CODE_ROW_HEIGHT) + OVERSCAN);
  return { height, start, end, top: top + start * CODE_ROW_HEIGHT - offset };
}

export function codeRow(code: string, offsets: Uint32Array, row: number) {
  return code.slice(offsets[row], offsets[row + 1]).replace(/\r?\n$/, '');
}
