import { Theme, useTheme } from '@astryxdesign/core/theme';
import { Stack } from '@astryxdesign/core/Stack';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { FileJson, X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { WorkspaceController } from '../workspace/useWorkspace';
import { fileTabsTheme } from '../themes/file-tabs';
import '../themes/file-tabs.css';

export function FileTabs({
  workspace,
  onClose,
}: {
  workspace: WorkspaceController;
  onClose: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const { mode } = useTheme();
  const { sessions, activeId } = workspace.state;
  const activeIndex = sessions.findIndex((session) => session.snapshot.id === activeId);
  return (
    <Theme theme={fileTabsTheme} mode={mode}>
      <Stack direction="horizontal" align="end" className="file-tabs">
        <TabList
          value={activeId ?? ''}
          onChange={(id) => workspace.dispatch({ type: 'activate', id })}
          size="lg"
          aria-label={t('openFiles')}
          className="tabs-grow"
        >
          {sessions.map((session) => (
            <div
              key={session.snapshot.id}
              className="file-tab file-item"
              title={session.snapshot.name}
            >
              <Tab
                value={session.snapshot.id}
                label={`${session.snapshot.name}${Object.keys(session.edits).length ? ' •' : ''}`}
                icon={<FileJson size={15} />}
                endContent={<span className="file-tab-action-space" aria-hidden="true" />}
              />
              <IconButton
                label={t('closeFile', { name: session.snapshot.name })}
                icon={<X size={14} />}
                variant="ghost"
                size="sm"
                className="file-close"
                onClick={() => onClose([session.snapshot.id])}
              />
            </div>
          ))}
        </TabList>
        <MoreMenu
          label={t('closeActions')}
          items={[
            {
              label: t('closeOthers'),
              onClick: () =>
                onClose(
                  sessions
                    .filter((session) => session.snapshot.id !== activeId)
                    .map((session) => session.snapshot.id),
                ),
            },
            {
              label: t('closeRight'),
              onClick: () =>
                onClose(sessions.slice(activeIndex + 1).map((session) => session.snapshot.id)),
            },
            {
              label: t('closeAll'),
              onClick: () => onClose(sessions.map((session) => session.snapshot.id)),
            },
          ]}
        />
      </Stack>
    </Theme>
  );
}
