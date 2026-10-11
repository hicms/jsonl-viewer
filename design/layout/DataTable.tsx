import { useState } from 'react';
import {
  Table,
  pixel,
  useTableColumnSettings,
  useTableColumnResize,
  useTableRowExpansion,
  type TableColumn,
} from '@astryxdesign/core/Table';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Text } from '@astryxdesign/core/Text';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Eye } from 'lucide-react';
import { useI18n } from '../../src/i18n';
import { jsonPreview } from '../../src/lib/jsonPreview';
import type { Line } from '../../src/lib/types';

type Row = Line & Record<string, unknown>;

export function DataTable({
  lines,
  onSelect,
  hidden,
}: {
  lines: Line[];
  onSelect: (index: number) => void;
  hidden: string[];
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(new Set<string>());
  const [widths, setWidths] = useState<Record<string, number>>({});
  const keys = [
    ...new Set(
      lines.flatMap((line) =>
        line.value && typeof line.value === 'object' && !Array.isArray(line.value)
          ? Object.keys(line.value)
          : [],
      ),
    ),
  ];
  const defaults: Record<string, number> = { level: 96, time: 250, message: 420, service: 100 };
  const columns: TableColumn<Row>[] = [
    {
      key: 'line',
      header: t('line'),
      width: pixel(60),
      renderCell: (row) => (
        <Text color="secondary" hasTabularNumbers>
          {row.index + 1}
        </Text>
      ),
    },
    ...keys.map((key): TableColumn<Row> => ({
      key,
      header: key,
      width: pixel(widths[key] ?? defaults[key] ?? 300),
      resizable: true,
      renderCell: (row) => (
        <Text type={key === 'time' ? 'code' : 'body'}>
          {jsonPreview(
            row.value && typeof row.value === 'object' && !Array.isArray(row.value)
              ? row.value[key]
              : null,
            t,
          )}
        </Text>
      ),
    })),
    {
      key: 'inspect',
      header: '',
      width: pixel(48),
      renderCell: (row) => (
        <IconButton
          label={t('inspectLine', { line: row.index + 1 })}
          icon={<Eye size={16} />}
          variant="ghost"
          size="sm"
          onClick={() => onSelect(row.index)}
        />
      ),
    },
  ];
  const settings = useTableColumnSettings<Row>({
    columns: [
      { key: 'line', label: t('line'), isAlwaysVisible: true },
      ...keys.map((key) => ({ key, label: key })),
      { key: 'inspect', label: t('inspect'), isAlwaysVisible: true },
    ],
    activeColumnKeys: ['line', ...keys.filter((key) => !hidden.includes(key)), 'inspect'],
    onChangeActiveColumnKeys: () => {},
  });
  const resize = useTableColumnResize<Row>({
    columnWidths: widths,
    onColumnResizeEnd: (patch) => setWidths((current) => ({ ...current, ...patch })),
    minWidth: 70,
  });
  const expansion = useTableRowExpansion<Row>({
    expandedKeys: expanded,
    getRowKey: (row) => String(row.index),
    onToggle: (key) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    renderExpanded: (row) => (
      <CodeBlock code={JSON.stringify(row.value, null, 2)} language="json" isWrapped />
    ),
  });
  return (
    <Table<Row>
      data={lines as Row[]}
      columns={columns}
      idKey="index"
      density="compact"
      hasHover
      dividers="rows"
      textOverflow="truncate"
      plugins={{ settings, resize, expansion }}
    />
  );
}
