import { useI18n } from '../i18n';
import { useEffect, useState } from 'react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Stack } from '@astryxdesign/core/Stack';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { SideNavItem } from '@astryxdesign/core/SideNav';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Spinner } from '@astryxdesign/core/Spinner';
import { api } from '../lib/bridge';
import type { Source } from '../lib/types';

export function SourceDialog({
  open,
  onClose,
  onOpen,
  report,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (path: string) => void;
  report: (error: unknown) => void;
}) {
  const { t, locale } = useI18n();
  const [sources, setSources] = useState<Source[]>([]);
  const [tab, setTab] = useState('codex');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    api
      .sources()
      .then((value) => {
        if (alive) setSources(value);
      })
      .catch(report)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);
  const source = sources.find((s) => s.key === tab);
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      width={760}
    >
      <Stack gap={4}>
        <DialogHeader
          title={t('agentSessions')}
          subtitle={t('sourceDescription')}
          onOpenChange={() => onClose()}
        />
        <TabList value={tab} onChange={setTab}>
          <Tab value="codex" label="Codex" />
          <Tab value="claude" label="Claude Code" />
          <Tab value="pi" label="Pi" />
          <Tab value="hermes" label="Hermes" />
        </TabList>
        {loading ? (
          <Spinner />
        ) : source?.files.length ? (
          <Stack gap={1}>
            <Text type="code" color="secondary">
              {source.path}
            </Text>
            {source.files.map((file) => (
              <SideNavItem
                key={file.path}
                label={file.name}
                onClick={() => {
                  onOpen(file.path);
                  onClose();
                }}
                endContent={
                  Date.now() - file.modified < 120000 ? (
                    <Badge label={t('live')} variant="success" />
                  ) : (
                    <Text color="secondary">
                      {new Date(file.modified).toLocaleDateString(locale)}
                    </Text>
                  )
                }
              />
            ))}
          </Stack>
        ) : (
          <EmptyState
            title={t('noSessions')}
            description={source?.exists ? source.path : t('missingSource')}
            isCompact
          />
        )}
      </Stack>
    </Dialog>
  );
}
