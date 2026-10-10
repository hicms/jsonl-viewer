import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { View } from '../lib/types';
import { useI18n } from '../i18n';

export function ViewSkeleton({ view }: { view: View }) {
  const { t } = useI18n();
  const loading = t('loadingView', { view: t(view) });
  return (
    <Stack gap={4} padding={4} role="status" aria-label={loading} aria-busy="true">
      <Text color="secondary">{loading}…</Text>
      {view === 'table' ? (
        <Stack gap={3}>
          {Array.from({ length: 9 }, (_, row) => (
            <div className="skeleton-table-row" key={row}>
              {[0, 1, 2, 3].map((column) => (
                <Skeleton key={column} height={row === 0 ? 24 : 18} index={row} radius={1} />
              ))}
            </div>
          ))}
        </Stack>
      ) : view === 'trace' ? (
        <Stack gap={5}>
          {[0, 1, 2].map((item) => (
            <Stack gap={3} key={item}>
              <Skeleton width={120} height={18} index={item} radius={1} />
              <Skeleton width="95%" height={60} index={item + 1} radius={2} />
              <Skeleton width="70%" height={18} index={item + 2} radius={1} />
            </Stack>
          ))}
        </Stack>
      ) : (
        <Stack gap={3}>
          {Array.from({ length: 10 }, (_, row) => (
            <div key={row} style={{ marginInlineStart: view === 'tree' ? (row % 3) * 20 : 0 }}>
              <Skeleton width={`${90 - (row % 3) * 15}%`} height={20} index={row} radius={1} />
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
