import { useI18n } from '../i18n';
import { useMemo, useState, type ReactNode } from 'react';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TreeList, type TreeListItemData } from '@astryxdesign/core/TreeList';
import { Folder, FolderOpen, FileJson, RefreshCw, X, MessagesSquare } from 'lucide-react';
import { RecentFiles } from './RecentFiles';
import { ExpandedSideNavContent } from './ExpandedSideNavContent';
import type { Entry } from '../lib/types';
import { api } from '../lib/bridge';
import type { WorkspaceController } from '../workspace/useWorkspace';

export function Explorer({
  workspace,
  onSources,
  onFolderReady,
  onClose,
  footer,
}: {
  footer?: ReactNode;
  workspace: WorkspaceController;
  onSources: () => void;
  onFolderReady: (action: () => Promise<void>) => void;
  onClose: (id: string) => void;
}) {
  const { t } = useI18n();
  const [folder, setFolder] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, Entry[]>>({});
  const [epoch, setEpoch] = useState(0);
  async function load(path: string) {
    try {
      const entries = await api.list(path);
      setCache((current) => ({ ...current, [path]: entries }));
    } catch (error) {
      workspace.report(error);
    }
  }
  async function choose() {
    try {
      const path = await api.folder();
      if (path) {
        await load(path);
        setFolder(path);
        setEpoch((e) => e + 1);
      }
    } catch (error) {
      workspace.report(error);
    }
  }
  onFolderReady(choose);
  const items = useMemo(() => {
    function map(entries: Entry[]): TreeListItemData[] {
      return entries.map((entry) => ({
        id: entry.path,
        label: (
          <Text maxLines={1} hasTruncateTooltip>
            {entry.name}
          </Text>
        ),
        startContent: entry.isDir ? <Folder size={16} /> : <FileJson size={16} />,
        description:
          entry.trace?.traceType === 'subagent' ? t('childSessions') : entry.trace?.format,
        onClick: () => {
          if (entry.isDir) void load(entry.path);
          else void workspace.open(entry.path);
        },
        children: entry.isDir
          ? cache[entry.path]
            ? map(cache[entry.path])
            : [
                {
                  id: `${entry.path}/load`,
                  label: t('readDirectory'),
                  onClick: () => void load(entry.path),
                },
              ]
          : undefined,
        isSelected: entry.path === workspace.active?.snapshot.path,
      }));
    }
    return folder ? map(cache[folder] ?? []) : [];
  }, [folder, cache, workspace.active?.snapshot.path, t]);
  return (
    <SideNav
      aria-label={t('fileBrowser')}
      resizable={{
        autoSaveId: 'jsonl-viewer:2:explorer',
        defaultWidth: 248,
        minWidth: 180,
        maxWidth: 440,
      }}
      collapsible
      header={
        <ExpandedSideNavContent>
          <Stack direction="horizontal" justify="between" align="center">
            <Heading level={2}>{t('fileBrowser')}</Heading>
            <IconButton
              label={t('openFolder')}
              icon={<FolderOpen size={16} />}
              variant="ghost"
              onClick={() => void choose()}
            />
          </Stack>
        </ExpandedSideNavContent>
      }
      topContent={
        <Stack gap={1}>
          <SideNavItem
            label={t('file')}
            icon={<FileJson size={17} />}
            onClick={() => void workspace.open()}
          />
          <SideNavItem
            label={t('folder')}
            icon={<FolderOpen size={17} />}
            onClick={() => void choose()}
          />
          <SideNavItem
            label={t('agentSessions')}
            icon={<MessagesSquare size={17} />}
            onClick={onSources}
          />
        </Stack>
      }
      footer={<ExpandedSideNavContent>{footer}</ExpandedSideNavContent>}
    >
      <Stack gap={4} paddingBlock={2}>
        {workspace.state.sessions.length ? (
          <SideNavSection title={t('opened')}>
            {workspace.state.sessions.map((session) => (
              <div key={session.snapshot.id} className="file-item">
                <SideNavItem
                  label={`${session.snapshot.name}${Object.keys(session.edits).length ? ' •' : ''}`}
                  icon={<FileJson size={16} />}
                  isSelected={session.snapshot.id === workspace.state.activeId}
                  onClick={() => workspace.dispatch({ type: 'activate', id: session.snapshot.id })}
                  actions={
                    <IconButton
                      label={t('closeFile', { name: session.snapshot.name })}
                      icon={<X size={14} />}
                      variant="ghost"
                      className="file-close"
                      onClick={() => onClose(session.snapshot.id)}
                    />
                  }
                />
              </div>
            ))}
          </SideNavSection>
        ) : null}
        {folder ? (
          <ExpandedSideNavContent>
            <Stack gap={2}>
              <Stack direction="horizontal" justify="between" align="center">
                <Text maxLines={1} hasTruncateTooltip>
                  {folder.split(/[\\/]/).at(-1)}
                </Text>
                <Stack direction="horizontal">
                  <IconButton
                    label={t('refreshDirectory')}
                    icon={<RefreshCw size={14} />}
                    variant="ghost"
                    onClick={() => {
                      setCache({});
                      void load(folder);
                      setEpoch((e) => e + 1);
                    }}
                  />
                  <IconButton
                    label={t('closeFolder')}
                    icon={<X size={14} />}
                    variant="ghost"
                    onClick={() => {
                      setFolder(null);
                      setCache({});
                    }}
                  />
                </Stack>
              </Stack>
              <TreeList
                key={epoch}
                items={items}
                density="compact"
                variant="noGuides"
                aria-label={t('directoryFiles')}
              />
            </Stack>
          </ExpandedSideNavContent>
        ) : null}
        {workspace.recent.length ? (
          <RecentFiles
            paths={workspace.recent}
            onOpen={(path) => void workspace.open(path)}
            onRemove={(path) =>
              workspace.setRecent((paths) => paths.filter((item) => item !== path))
            }
          />
        ) : null}
      </Stack>
    </SideNav>
  );
}
