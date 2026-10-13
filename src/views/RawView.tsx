import { useI18n } from '../i18n';
import { memo, useState } from 'react';
import { Stack } from '@astryxdesign/core/Stack';
import { Button } from '@astryxdesign/core/Button';
import { Pagination } from '@astryxdesign/core/Pagination';
import type { Line } from '../lib/types';
import { JsonCode } from '../components/JsonCode';

export const RawView = memo(function RawView({
  lines,
  onSelect,
}: {
  lines: Line[];
  onSelect: (index: number) => void;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const actualPage = Math.min(page, Math.max(1, Math.ceil(lines.length / 100)));
  return (
    <Stack padding={4} gap={3} className={lines.length === 1 ? 'raw-document' : undefined}>
      {lines.slice((actualPage - 1) * 100, actualPage * 100).map((line) => (
        <Stack key={line.index} gap={1}>
          <JsonCode
            code={line.raw}
            copyLabel={t('copyRaw')}
            header={
              <Button
                label={`${t('lineNumber', { line: line.index + 1 })}${line.parseError ? ` · ${t('jsonError')}` : ''}`}
                variant="ghost"
                onClick={() => onSelect(line.index)}
              />
            }
          />
        </Stack>
      ))}
      {lines.length > 1 ? (
        <Pagination
          page={actualPage}
          onChange={setPage}
          totalItems={lines.length}
          pageSize={100}
          label={t('rawPagination')}
        />
      ) : null}
    </Stack>
  );
});
