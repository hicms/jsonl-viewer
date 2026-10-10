import { useI18n } from '../i18n';
import { useState } from 'react';
import { SideNavItem } from '@astryxdesign/core/SideNav';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Button } from '@astryxdesign/core/Button';
import { History, Trash2 } from 'lucide-react';

export function RecentFiles({
  paths,
  onOpen,
  onRemove,
}: {
  paths: string[];
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  return (
    <section aria-label={t('recentFiles')}>
      <Stack gap={1}>
        <Text color="secondary">{t('recentFiles')}</Text>
        {(expanded ? paths : paths.slice(0, 5)).map((path) => (
          <div key={path} className="file-item">
            <SideNavItem
              label={path.split(/[\\/]/).at(-1) ?? path}
              icon={<History size={15} />}
              onClick={() => onOpen(path)}
              actions={
                <IconButton
                  label={t('removeHistory', { name: path.split(/[\\/]/).at(-1) ?? path })}
                  icon={<Trash2 size={15} />}
                  variant="ghost"
                  className="file-close"
                  onClick={() => onRemove(path)}
                />
              }
            />
          </div>
        ))}
        {paths.length > 5 ? (
          <Button
            label={expanded ? t('collapse') : t('showMore', { count: paths.length - 5 })}
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          />
        ) : null}
      </Stack>
    </section>
  );
}
