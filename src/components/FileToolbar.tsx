import { useI18n } from '../i18n';
import { Stack } from '@astryxdesign/core/Stack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import {
  Search,
  RefreshCw,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Maximize2,
  Minimize2,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import type { Session, View } from '../lib/types';
import type { WorkspaceController } from '../workspace/useWorkspace';
import { DocumentActions } from './DocumentActions';

export function FileToolbar({
  session,
  workspace,
}: {
  session: Session;
  workspace: WorkspaceController;
}) {
  const { t } = useI18n();
  const { snapshot, ui } = session;
  const set = (patch: Partial<Session['ui']>) => workspace.ui(snapshot.id, patch);
  return (
    <Stack className="file-toolbar" direction="horizontal" gap={2} align="center" padding={3}>
      <div className="toolbar-search">
        <TextInput
          label={t('searchLoaded')}
          isLabelHidden
          value={ui.filter}
          onChange={(value) => set({ filter: value })}
          placeholder={ui.view === 'trace' ? t('searchSession') : t('searchJson')}
          hasClear
          startIcon={<Search size={16} />}
          width="fill"
        />
      </div>
      <TabList
        value={ui.view}
        onChange={(value) => set({ view: value as View, selected: null })}
        aria-label={t('dataViews')}
      >
        <Tab value="table" label={t('table')} />
        <Tab value="tree" label={t('tree')} />
        <Tab value="raw" label={t('raw')} />
        {snapshot.trace ? <Tab value="trace" label={t('trace')} /> : null}
      </TabList>
      <DocumentActions session={session} workspace={workspace} />
      <MoreMenu
        label={t('fileActions')}
        items={[
          { label: t('saveAs'), onClick: () => void workspace.save(snapshot.id, true) },
          {
            label: t('reload'),
            icon: <RefreshCw size={16} />,
            isDisabled: !!Object.keys(session.edits).length,
            onClick: () => void workspace.request(snapshot.id, 'refresh'),
          },
        ]}
      />
      {ui.view === 'trace' ? (
        <Stack direction="horizontal" gap={1} role="group" aria-label={t('sessionOptions')}>
          <IconButton
            label={ui.order === 'oldest' ? t('newestFirst') : t('oldestFirst')}
            tooltip={ui.order === 'oldest' ? t('orderOldestHint') : t('orderNewestHint')}
            icon={
              ui.order === 'oldest' ? (
                <ArrowDownWideNarrow size={16} />
              ) : (
                <ArrowUpWideNarrow size={16} />
              )
            }
            variant="ghost"
            onClick={() =>
              set({ order: ui.order === 'oldest' ? 'newest' : 'oldest', follow: true })
            }
          />
          <IconButton
            label={ui.wide ? t('compact') : t('wide')}
            tooltip={ui.wide ? t('wideHint') : t('compactHint')}
            icon={ui.wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            variant="ghost"
            onClick={() => set({ wide: !ui.wide })}
          />
          <IconButton
            label={ui.expanded ? t('collapseDetails') : t('expandDetails')}
            tooltip={ui.expanded ? t('collapseDetailsHint') : t('expandDetailsHint')}
            icon={ui.expanded ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
            variant="ghost"
            onClick={() => set({ expanded: !ui.expanded })}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}
