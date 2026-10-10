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
  const [row, setRow] = useState<string | null>(null);
  return (
    <ContextMenu
      label="行操作"
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
                label: expanded.has(row) ? '折叠行' : '展开行',
                onClick: () => onToggle(row),
              },
            ]
      }
    >
      {children}
    </ContextMenu>
  );
}
