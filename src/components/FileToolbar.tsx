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
  const { snapshot, ui } = session;
  const set = (patch: Partial<Session['ui']>) => workspace.ui(snapshot.id, patch);
  return (
    <Stack className="file-toolbar" direction="horizontal" gap={2} align="center" padding={3}>
      <div className="toolbar-search">
        <TextInput
          label="搜索已加载内容"
          isLabelHidden
          value={ui.filter}
          onChange={(value) => set({ filter: value })}
          placeholder={ui.view === 'trace' ? '搜索消息、思考与工具结果…' : '搜索已加载的 JSON 行…'}
          hasClear
          startIcon={<Search size={16} />}
          width="fill"
        />
      </div>
      <TabList
        value={ui.view}
        onChange={(value) => set({ view: value as View, selected: null })}
        aria-label="数据视图"
      >
        <Tab value="table" label="表格" />
        <Tab value="tree" label="树形" />
        <Tab value="raw" label="原文" />
        {snapshot.trace ? <Tab value="trace" label="会话" /> : null}
      </TabList>
      <DocumentActions session={session} workspace={workspace} />
      <MoreMenu
        label="文件操作"
        items={[
          { label: '另存为…', onClick: () => void workspace.save(snapshot.id, true) },
          {
            label: '重新加载',
            icon: <RefreshCw size={16} />,
            isDisabled: !!Object.keys(session.edits).length,
            onClick: () => void workspace.request(snapshot.id, 'refresh'),
          },
        ]}
      />
      {ui.view === 'trace' ? (
        <Stack direction="horizontal" gap={1} role="group" aria-label="会话显示选项">
          <IconButton
            label={ui.order === 'oldest' ? '最新在前' : '从旧到新'}
            tooltip={
              ui.order === 'oldest' ? '当前从旧到新，点击让最新在前' : '当前最新在前，点击从旧到新'
            }
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
            label={ui.wide ? '紧凑' : '宽屏'}
            tooltip={ui.wide ? '当前宽屏，点击切换紧凑布局' : '当前紧凑，点击切换宽屏布局'}
            icon={ui.wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            variant="ghost"
            onClick={() => set({ wide: !ui.wide })}
          />
          <IconButton
            label={ui.expanded ? '折叠详情' : '展开详情'}
            tooltip={ui.expanded ? '折叠思考和工具详情' : '展开思考和工具详情'}
            icon={ui.expanded ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
            variant="ghost"
            onClick={() => set({ expanded: !ui.expanded })}
          />
        </Stack>
      ) : null}
    </Stack>
  );
}
