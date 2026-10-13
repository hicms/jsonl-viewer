import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { useI18n } from '../i18n';

export function FileLoadingSkeleton({
  paths,
  compact = false,
}: {
  paths: string[];
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Stack
      gap={4}
      padding={4}
      role="status"
      aria-label={t('openingFile')}
      aria-busy="true"
      className={compact ? 'opening-files' : 'file-loading-skeleton'}
    >
      {paths.filter(Boolean).map((path) => (
        <Text key={path} type="code" maxLines={1}>
          {path.split(/[\\/]/).at(-1)}
        </Text>
      ))}
      <Skeleton width={compact ? 180 : '40%'} height={20} radius={1} />
      {!compact ? (
        <>
          <Stack direction="horizontal" gap={3}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} width={52} height={28} index={index} radius={1} />
            ))}
          </Stack>
          <Skeleton height={32} radius={2} />
          <Stack gap={3}>
            {Array.from({ length: 12 }, (_, row) => (
              <div className="skeleton-table-row" key={row}>
                {[0, 1, 2, 3].map((column) => (
                  <Skeleton key={column} height={row === 0 ? 24 : 18} index={row} radius={1} />
                ))}
              </div>
            ))}
          </Stack>
        </>
      ) : null}
    </Stack>
  );
}
