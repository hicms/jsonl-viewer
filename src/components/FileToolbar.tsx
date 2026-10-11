import { useI18n } from '../i18n';
import { Stack } from '@astryxdesign/core/Stack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import {
  Search,
  Columns3,
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
import type { TableField } from '../lib/tableColumns';

export function FileToolbar({
  session,
  workspace,
  fields,
  hiddenColumns,
  onShowColumns,
}: {
  fields: TableField[];
  hiddenColumns: string[];
  onShowColumns: (visible: string[]) => void;
  session: Session;
  workspace: WorkspaceController;
}) {
  const { t } = useI18n();
  const { snapshot, ui } = session;
  const set = (patch: Partial<Session['ui']>) => workspace.ui(snapshot.id, patch);
  return (
    <Stack className="file-toolbar" gap={0}>
      <Stack
        direction="horizontal"
        align="center"
        gap={2}
        paddingInline={3}
        className="toolbar-options-row"
      >
        <TabList
          value={ui.view}
          onChange={(value) => set({ view: value as View, selected: null })}
          aria-label={t('dataViews')}
          className="toolbar-view-tabs"
        >
          <Tab value="table" label={t('table')} />
          <Tab value="tree" label={t('tree')} />
          <Tab value="raw" label={t('raw')} />
          {snapshot.trace ? <Tab value="trace" label={t('trace')} /> : null}
        </TabList>
        <Stack direction="horizontal" align="center" gap={1} className="toolbar-options">
          {ui.view === 'table' ? (
            <MultiSelector
              label={t('visibleColumns')}
              options={fields.map((field) => ({ value: field.id, label: field.key ?? t('value') }))}
              value={fields
                .filter((field) => !hiddenColumns.includes(field.id))
                .map((field) => field.id)}
              onChange={onShowColumns}
              renderTrigger={(props) => (
                <IconButton
                  {...props}
                  label={t('visibleColumns')}
                  icon={<Columns3 size={16} />}
                  variant="ghost"
                />
              )}
            />
          ) : null}
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
      </Stack>
      <Stack paddingInline={3} paddingBlock={2}>
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
      </Stack>
    </Stack>
  );
}
