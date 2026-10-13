import { useLayoutEffect, useRef } from 'react';
import type { Line } from '../lib/types';

// Detail panels use the visible table viewport, independently of column widths.
export function useTableViewport(lines: Line[], page: number) {
  const table = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const element = table.current;
    const viewport = element?.closest<HTMLElement>('.astryx-table-scroll-wrapper');
    if (!element || !viewport) return;
    function measure() {
      viewport!.style.setProperty('--table-viewport-width', `${viewport!.clientWidth}px`);
    }
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [lines, page]);
  return table;
}
