import { useState } from 'react';
import { Stack } from '@astryxdesign/core/Stack';
import { Button } from '@astryxdesign/core/Button';
import { CodeBlock } from '@astryxdesign/core/CodeBlock';
import { Pagination } from '@astryxdesign/core/Pagination';
import type { Line } from '../lib/types';

export function RawView({ lines, onSelect }: { lines: Line[]; onSelect: (index: number) => void }) {
  const [page, setPage] = useState(1);
  const actualPage = Math.min(page, Math.max(1, Math.ceil(lines.length / 100)));
  return (
    <Stack padding={4} gap={3}>
      {lines.slice((actualPage - 1) * 100, actualPage * 100).map((line) => (
        <Stack key={line.index} gap={1}>
          <Button
            label={`第 ${line.index + 1} 行${line.parseError ? ' · JSON 错误' : ''}`}
            variant="ghost"
            onClick={() => onSelect(line.index)}
          />
          <CodeBlock code={line.raw} language="json" hasLanguageLabel={false} isWrapped size="sm" />
        </Stack>
      ))}
      <Pagination
        page={actualPage}
        onChange={setPage}
        totalItems={lines.length}
        pageSize={100}
        label="原文记录分页"
      />
    </Stack>
  );
}
