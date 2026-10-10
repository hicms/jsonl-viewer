import { useMemo, useState } from 'react';
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TreeList, type TreeListItemData } from '@astryxdesign/core/TreeList';
import { Folder, FolderOpen, FileJson, RefreshCw, X, MessagesSquare } from 'lucide-react';
import { RecentFiles } from './RecentFiles';
import type { Entry } from '../lib/types';
import { api } from '../lib/bridge';
import type { WorkspaceController } from '../workspace/useWorkspace';

export function Explorer({
  workspace,
  onSources,
  onFolderReady,
  onClose,
}: {
  workspace: WorkspaceController;
  onSources: () => void;
  onFolderReady: (action: () => Promise<void>) => void;
  onClose: (id: string) => void;
}) {
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
        description: entry.trace?.traceType === 'subagent' ? '子会话' : entry.trace?.format,
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
                  label: '读取目录',
                  onClick: () => void load(entry.path),
                },
              ]
          : undefined,
        isSelected: entry.path === workspace.active?.snapshot.path,
      }));
    }
    return folder ? map(cache[folder] ?? []) : [];
  }, [folder, cache, workspace.active?.snapshot.path]);
  return (
    <SideNav
      aria-label="文件浏览器"
      resizable={{
        autoSaveId: 'jsonl-viewer:2:explorer',
        defaultWidth: 260,
        minWidth: 180,
        maxWidth: 440,
      }}
      collapsible
      header={
        <Stack direction="horizontal" justify="between" align="center">
          <Heading level={2}>文件浏览器</Heading>
          <IconButton
            label="打开文件夹"
            icon={<FolderOpen size={16} />}
            variant="ghost"
            onClick={() => void choose()}
          />
        </Stack>
      }
    >
      <Stack gap={5} paddingBlock={3}>
        <Stack gap={1}>
          <Text color="secondary">打开</Text>
          <SideNavItem
            label="文件"
            icon={<FileJson size={17} />}
            onClick={() => void workspace.open()}
          />
          <SideNavItem
            label="文件夹"
            icon={<FolderOpen size={17} />}
            onClick={() => void choose()}
          />
          <SideNavItem label="Agent 会话" icon={<MessagesSquare size={17} />} onClick={onSources} />
        </Stack>
        {workspace.state.sessions.length ? (
          <Stack gap={1}>
            <Text color="secondary">已打开</Text>
            {workspace.state.sessions.map((session) => (
              <div key={session.snapshot.id} className="file-item">
                <SideNavItem
                  label={`${session.snapshot.name}${Object.keys(session.edits).length ? ' •' : ''}`}
                  icon={<FileJson size={16} />}
                  isSelected={session.snapshot.id === workspace.state.activeId}
                  onClick={() => workspace.dispatch({ type: 'activate', id: session.snapshot.id })}
                  actions={
                    <IconButton
                      label={`关闭 ${session.snapshot.name}`}
                      icon={<X size={14} />}
                      variant="ghost"
                      className="file-close"
                      onClick={() => onClose(session.snapshot.id)}
                    />
                  }
                />
              </div>
            ))}
          </Stack>
        ) : null}
        {folder ? (
          <Stack gap={2}>
            <Stack direction="horizontal" justify="between" align="center">
              <Text maxLines={1} hasTruncateTooltip>
                {folder.split(/[\\/]/).at(-1)}
              </Text>
              <Stack direction="horizontal">
                <IconButton
                  label="刷新目录"
                  icon={<RefreshCw size={14} />}
                  variant="ghost"
                  onClick={() => {
                    setCache({});
                    void load(folder);
                    setEpoch((e) => e + 1);
                  }}
                />
                <IconButton
                  label="关闭文件夹"
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
              aria-label="目录文件"
            />
          </Stack>
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
