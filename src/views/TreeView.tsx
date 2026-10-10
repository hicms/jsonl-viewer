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
): TreeListItemData {
  const container = value !== null && typeof value === 'object';
  return {
    id,
    label: (
      <Text type="code">
        {label}
        {container
          ? ` · ${Array.isArray(value) ? '数组' : '对象'} (${Object.keys(value).length})`
          : `: ${jsonPreview(value)}`}
      </Text>
    ),
    onClick: onSelect,
    isExpanded: expand,
    children: container
      ? Object.entries(value).map(([key, child]) =>
          node(child, key, `${id}/${encodeURIComponent(key)}`, expand, onSelect),
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
                  第 {line.index + 1} 行 · {line.parseError}
                </Text>
              ),
              onClick: () => onSelect(line.index),
            }
          : node(line.value, `第 ${line.index + 1} 行`, String(line.index), expanded, () =>
              onSelect(line.index),
            ),
      ),
    [lines, actualPage, expanded, onSelect],
  );
  return (
    <Stack gap={3} padding={4}>
      <Stack direction="horizontal" gap={2}>
        <Button
          label="展开全部"
          variant="ghost"
          onClick={() => {
            setExpanded(true);
            setEpoch((e) => e + 1);
          }}
        />
        <Button
          label="折叠全部"
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
        aria-label="JSON 树"
      />
      <Pagination
        page={actualPage}
        onChange={setPage}
        totalItems={lines.length}
        pageSize={100}
        label="树形记录分页"
      />
    </Stack>
  );
});
