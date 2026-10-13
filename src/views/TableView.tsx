import { useI18n } from '../i18n';
import { memo, useCallback, useMemo, useState } from 'react';
import {
  Table,
  pixel,
  useTableColumnResize,
  useTableRowExpansion,
  useTableStickyColumns,
  type TableColumn,
  type TablePlugin,
} from '@astryxdesign/core/Table';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Badge } from '@astryxdesign/core/Badge';
import { Pagination } from '@astryxdesign/core/Pagination';
import { Text } from '@astryxdesign/core/Text';
import { Eye } from 'lucide-react';
import { usePreference } from '../lib/preferences';
import { lineText } from '../lib/lineText';
import { JsonCode } from '../components/JsonCode';
import type { Line } from '../lib/types';
import { jsonPreview } from '../lib/jsonPreview';
import type { TableField } from '../lib/tableColumns';
import { TableRowMenu } from '../components/TableRowMenu';
import { useTableViewport } from './useTableViewport';
import { MAX_CODE_SCROLL_HEIGHT } from '../lib/codeWindow';

type Row = Line & Record<string, unknown>;
export const TableView = memo(function TableView({
  lines,
  onSelect,
  fields,
  hiddenColumns,
}: {
  fields: TableField[];
  hiddenColumns: string[];
  lines: Line[];
  onSelect: (index: number) => void;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [widths, setWidths] = usePreference<Record<string, number>>('columnWidths', {});
  const [expanded, setExpanded] = useState(new Set<string>());
  const actualPage = Math.min(page, Math.max(1, Math.ceil(lines.length / 100)));
  const pageLines = lines.slice((actualPage - 1) * 100, actualPage * 100);
  const expandedCount = pageLines.filter((line) => expanded.has(String(line.index))).length;
  const toggleRow = useCallback((key: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const visibleFields = fields.filter((field) => !hiddenColumns.includes(field.id));
  const columns: TableColumn<Row>[] = [
    {
      key: 'internal:line',
      header: t('line'),
      width: pixel(72),
      renderCell: (row) => (
        <Text color="secondary" hasTabularNumbers>
          {row.index + 1}
        </Text>
      ),
    },
    ...visibleFields.map((field) => ({
      key: field.id,
      header: field.key ?? t('value'),
      width: pixel(widths[field.id] ?? 220),
      resizable: true,
      renderCell: (row: Row) =>
        row.parseError ? (
          field.id === visibleFields[0]?.id ? (
            <Badge label={t('jsonError')} variant="error" />
          ) : null
        ) : (
          <Text type="code">
            {jsonPreview(
              field.key === null
                ? row.value
                : row.value && typeof row.value === 'object' && !Array.isArray(row.value)
                  ? row.value[field.key]
                  : null,
              t,
            )}
          </Text>
        ),
    })),
    {
      key: 'internal:inspect',
      header: '',
      width: pixel(52),
      renderCell: (row) => (
        <IconButton
          label={t('inspectLine', { line: row.index + 1 })}
          icon={<Eye size={16} />}
          variant="ghost"
          onClick={() => onSelect(row.index)}
        />
      ),
    },
  ];
  const resize = useTableColumnResize<Row>({
    columnWidths: widths,
    onColumnResizeEnd: (updates) => setWidths((current) => ({ ...current, ...updates })),
    minWidth: 70,
  });
  const sticky = useTableStickyColumns<Row>({ endKeys: ['internal:inspect'] });
  const expansion = useTableRowExpansion<Row>({
    expandedKeys: expanded,
    getRowKey: (row) => String(row.index),
    onToggle: toggleRow,
    renderExpanded: (row) => (
      <div className="table-expanded">
        <JsonCode
          code={lineText(row)}
          scrollParent=".astryx-table-scroll-wrapper"
          scrollHeightLimit={MAX_CODE_SCROLL_HEIGHT / Math.max(1, expandedCount)}
        />
      </div>
    ),
  });
  const rowExpansion = useMemo<TablePlugin<Row>>(
    () => ({
      ...expansion,
      transformScrollWrapper(props) {
        return { ...props, htmlProps: { ...props.htmlProps, tabIndex: 0 } };
      },
      // Share the row menu instead of mounting a menu for every cell.
      transformBodyCell(props, ...args) {
        const transformed = expansion.transformBodyCell?.(props, ...args) ?? props;
        return { ...transformed, contextMenuActions: props.contextMenuActions };
      },
      transformBodyRow(props, item, index) {
        const transformed = expansion.transformBodyRow?.(props, item, index) ?? props;
        return {
          ...transformed,
          htmlProps: { ...transformed.htmlProps, 'data-record-index': item.index },
        };
      },
    }),
    [expansion],
  );
  const table = useTableViewport(lines, actualPage);
  return (
    <div className="table-view">
      <TableRowMenu expanded={expanded} onToggle={toggleRow}>
        <Table<Row>
          ref={table}
          data={pageLines as Row[]}
          columns={columns}
          idKey="index"
          density="compact"
          hasHover
          dividers="rows"
          textOverflow="truncate"
          plugins={{ resize, expansion: rowExpansion, sticky }}
        />
      </TableRowMenu>
      {lines.length > 100 ? (
        <Pagination
          page={actualPage}
          onChange={setPage}
          totalItems={lines.length}
          pageSize={100}
          label={t('tablePagination')}
        />
      ) : null}
    </div>
  );
});
