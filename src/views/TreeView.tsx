import { useI18n, type Translate } from '../i18n';
import { memo, useMemo, useState } from 'react';
import { TreeList, type TreeListItemData } from '@astryxdesign/core/TreeList';
import { Button } from '@astryxdesign/core/Button';
import { Stack } from '@astryxdesign/core/Stack';
import { Pagination } from '@astryxdesign/core/Pagination';
import { Text } from '@astryxdesign/core/Text';
import type { Json, Line } from '../lib/types';
import { jsonPreview } from '../lib/jsonPreview';

function node(
  value: Json,
  label: string,
  id: string,
  expand: boolean,
  onSelect: () => void,
  t: Translate,
): TreeListItemData {
  const container = value !== null && typeof value === 'object';
  return {
    id,
    label: (
      <Text type="code">
        {label}
        {container
          ? ` · ${Array.isArray(value) ? t('array') : t('object')} (${Object.keys(value).length})`
          : `: ${jsonPreview(value, t)}`}
      </Text>
    ),
    onClick: onSelect,
    isExpanded: expand,
    children: container
      ? Object.entries(value).map(([key, child]) =>
          node(child, key, `${id}/${encodeURIComponent(key)}`, expand, onSelect, t),
        )
      : undefined,
  };
}
export const TreeView = memo(function TreeView({
  lines,
  onSelect,
}: {
  lines: Line[];
  onSelect: (index: number) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [page, setPage] = useState(1);
  const actualPage = Math.min(page, Math.max(1, Math.ceil(lines.length / 100)));
  const items = useMemo(
    () =>
      lines.slice((actualPage - 1) * 100, actualPage * 100).map((line) =>
        line.parseError
          ? {
              id: String(line.index),
              label: (
                <Text color="secondary">
                  {t('lineNumber', { line: line.index + 1 })} · {line.parseError}
                </Text>
              ),
              onClick: () => onSelect(line.index),
            }
          : node(
              line.value,
              t('lineNumber', { line: line.index + 1 }),
              String(line.index),
              expanded,
              () => onSelect(line.index),
              t,
            ),
      ),
    [lines, actualPage, expanded, onSelect, t],
  );
  return (
    <Stack gap={3} padding={4}>
      <Stack direction="horizontal" gap={2}>
        <Button
          label={t('expandAll')}
          variant="ghost"
          onClick={() => {
            setExpanded(true);
            setEpoch((e) => e + 1);
          }}
        />
        <Button
          label={t('collapseAll')}
          variant="ghost"
          onClick={() => {
            setExpanded(false);
            setEpoch((e) => e + 1);
          }}
        />
      </Stack>
      <TreeList
        key={`${epoch}/${actualPage}`}
        items={items}
        density="compact"
        aria-label={t('jsonTree')}
      />
      <Pagination
        page={actualPage}
        onChange={setPage}
        totalItems={lines.length}
        pageSize={100}
        label={t('treePagination')}
      />
    </Stack>
  );
});
