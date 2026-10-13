import { memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Copy } from 'lucide-react';
import { useI18n } from '../i18n';
import { codeRow, codeWindow, indexCode } from '../lib/codeWindow';

type Props = {
  code: string;
  hasCopyButton?: boolean;
  copyLabel?: string;
  header?: ReactNode;
  report?: (error: unknown) => void;
  scrollParent?: string;
  scrollHeightLimit?: number;
};

export const JsonCode = memo(function JsonCode({ code, hasCopyButton = true, ...props }: Props) {
  if (code.length > 100_000 || code.split('\n').length > 5000) {
    return <VirtualCode code={code} hasCopyButton={hasCopyButton} {...props} />;
  }
  return (
    <>
      {props.header}
      <CodeBlock
        code={code}
        language="json"
        title=""
        hasLanguageLabel={false}
        isWrapped
        size="sm"
        width="100%"
        hasCopyButton={hasCopyButton}
      />
    </>
  );
});

function VirtualCode({
  code,
  hasCopyButton,
  copyLabel,
  header,
  report,
  scrollParent,
  scrollHeightLimit,
}: Props) {
  const { t } = useI18n();
  const [columns, setColumns] = useState(0);
  const offsets = useMemo(
    () => (columns ? indexCode(code, columns) : Uint32Array.of(0, 0)),
    [code, columns],
  );
  const scroll = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const metrics = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState({ top: 0, height: 600, visible: true });
  const [error, setError] = useState<string>();
  function measure() {
    const element = scroll.current!;
    const glyphWidth = metrics.current!.offsetWidth
      ? Math.ceil(metrics.current!.offsetWidth / 32)
      : 8;
    const style = getComputedStyle(track.current!.firstElementChild!);
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    setColumns(Math.max(1, Math.floor(((element.clientWidth || 640) - padding) / glyphWidth)));
    const parent = scrollParent ? element.closest<HTMLElement>(scrollParent) : null;
    let top = element.scrollTop - track.current!.offsetTop;
    let height = element.clientHeight || 600;
    let visible = true;
    if (parent) {
      const zoom = parseFloat(getComputedStyle(element).getPropertyValue('--app-zoom')) || 1;
      top =
        (parent.getBoundingClientRect().top - track.current!.getBoundingClientRect().top) / zoom +
        parent.clientTop;
      height = parent.clientHeight || 600;
      const trackHeight = parseFloat(track.current!.style.height);
      visible = top < trackHeight && top + height > 0;
    }
    const next = {
      top: Math.max(0, top),
      height: Math.max(1, height - Math.max(0, -top)),
      visible,
    };
    setPosition((current) =>
      current.top === next.top && current.height === next.height && current.visible === next.visible
        ? current
        : next,
    );
  }
  useLayoutEffect(() => {
    const element = scroll.current!;
    element.scrollTop = 0;
    element.scrollLeft = 0;
    measure();
    const parent = scrollParent ? element.closest<HTMLElement>(scrollParent) : null;
    parent?.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    if (parent) {
      observer?.observe(parent);
      const table = element.closest('table');
      if (table) observer?.observe(table);
    }
    return () => {
      observer?.disconnect();
      parent?.removeEventListener('scroll', measure);
    };
  }, [code, scrollParent]);
  useLayoutEffect(measure, [offsets, scrollHeightLimit]);
  const window = codeWindow(offsets.length - 1, position.top, position.height, scrollHeightLimit);
  const rows = [];
  for (let row = window.start; position.visible && row < window.end; row++) {
    rows.push(
      <Text key={row} type="code" className="virtual-code-row" data-code-row={row}>
        {codeRow(code, offsets, row) || '\u200b'}
      </Text>,
    );
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setError(undefined);
    } catch (error) {
      if (report) report(error);
      else setError(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <Card padding={0} className="virtual-code">
      <div
        ref={scroll}
        className={scrollParent ? 'virtual-code-flow' : 'virtual-code-scroll'}
        role="region"
        aria-label={t('jsonContent')}
        tabIndex={0}
        onScroll={scrollParent ? undefined : measure}
      >
        <Text ref={metrics} type="code" className="virtual-code-metrics" aria-hidden="true">
          {'0'.repeat(32)}
        </Text>
        {hasCopyButton || header ? (
          <Stack
            direction="horizontal"
            justify={header ? 'between' : 'end'}
            align="center"
            padding={2}
          >
            {header}
            {hasCopyButton ? (
              <IconButton
                label={copyLabel ?? t('copyJson')}
                icon={<Copy size={16} />}
                variant="ghost"
                size="sm"
                onClick={() => void copy()}
              />
            ) : null}
          </Stack>
        ) : null}
        {error ? <Text>{error}</Text> : null}
        <div ref={track} className="virtual-code-track" style={{ height: window.height }}>
          <div className="virtual-code-window" style={{ top: window.top }}>
            {rows}
          </div>
        </div>
      </div>
    </Card>
  );
}
