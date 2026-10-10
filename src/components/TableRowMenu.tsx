import { useI18n } from '../i18n';
import { useState, type ReactNode } from 'react';
import { ContextMenu } from '@astryxdesign/core/ContextMenu';

function recordAt(target: EventTarget | null) {
  return target instanceof Element
    ? (target.closest<HTMLElement>('tr[data-record-index]')?.dataset.recordIndex ?? null)
    : null;
}

export function TableRowMenu({
  children,
  expanded,
  onToggle,
}: {
  children: ReactNode;
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  const { t } = useI18n();
  const [row, setRow] = useState<string | null>(null);
  return (
    <ContextMenu
      label={t('rowActions')}
      onTouchStartCapture={(event) => setRow(recordAt(event.target))}
      onContextMenuCapture={(event) => {
        const record = recordAt(event.target);
        if (record === null) {
          event.stopPropagation();
          return;
        }
        setRow(record);
      }}
      items={
        row === null
          ? []
          : [
              {
                label: expanded.has(row) ? t('collapseRow') : t('expandRow'),
                onClick: () => onToggle(row),
              },
            ]
      }
    >
      {children}
    </ContextMenu>
  );
}
