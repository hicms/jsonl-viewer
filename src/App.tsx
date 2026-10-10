import { useI18n } from './i18n';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Stack } from '@astryxdesign/core/Stack';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { ToastViewport } from '@astryxdesign/core/Toast';
import { FileJson, FolderOpen, MessagesSquare, X, Minus, Plus } from 'lucide-react';
import appLogo from '../src-tauri/icons/icon.svg';
import { Explorer } from './components/Explorer';
import { FileToolbar } from './components/FileToolbar';
import { TableView } from './views/TableView';
import { TreeView } from './views/TreeView';
import { RawView } from './views/RawView';
import { Inspector } from './views/Inspector';
import { DocumentActions } from './components/DocumentActions';
import { DeferredView } from './components/DeferredView';
import { useWorkspace } from './workspace/useWorkspace';
import { visibleLines } from './workspace/reducer';
import { usePreference, bytes, stringify } from './lib/preferences';
import { api, bindNative, exitApp, isNative } from './lib/bridge';
import type { Entry, View } from './lib/types';
import { Spinner } from '@astryxdesign/core/Spinner';

const TraceView = lazy(() =>
  import('./views/TraceView').then((module) => ({ default: module.TraceView })),
);
const SourceDialog = lazy(() =>
  import('./components/SourceDialog').then((module) => ({ default: module.SourceDialog })),
);

export function App() {
  const [mode, setMode] = usePreference<'light' | 'dark' | 'system'>('mode', 'light');
  return (
    <Theme theme={neutralTheme} mode={mode}>
      <ToastViewport position="bottomEnd" inset={{ bottom: 64 }}>
        <Application mode={mode} setMode={setMode} />
      </ToastViewport>
    </Theme>
  );
}

function Application({
  mode,
  setMode,
}: {
  mode: string;
  setMode: (value: 'light' | 'dark' | 'system') => void;
}) {
  const { t, locale } = useI18n();
  const workspace = useWorkspace();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [zoom, setZoom] = usePreference('zoom', 1);
  const [closeIntent, setCloseIntent] = useState<{ ids: string[]; quit: boolean } | null>(null);
  const [siblings, setSiblings] = useState<Entry[]>([]);
  const folderAction = useRef<() => Promise<void>>(async () => {});
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const menuUpdates = useRef(Promise.resolve());
  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    menuUpdates.current = menuUpdates.current
      .then(() => {
        if (!cancelled) return api.locale(locale);
      })
      .catch((error) => {
        workspaceRef.current.report(error);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);
  const active = workspace.active;
  const lines = useMemo(
    () => (active ? visibleLines(active) : []),
    [active?.snapshot.lines, active?.edits],
  );
  const filtered = useMemo(() => {
    const query = active?.ui.filter.toLowerCase() ?? '';
    return query ? lines.filter((line) => line.raw.toLowerCase().includes(query)) : lines;
  }, [lines, active?.ui.filter]);
  const activeId = active?.snapshot.id;
  const dispatch = workspace.dispatch;
  const selectLine = useCallback(
    (index: number) => {
      if (activeId) dispatch({ type: 'ui', id: activeId, patch: { selected: index } });
    },
    [activeId, dispatch],
  );
  const selected = lines.find((line) => line.index === active?.ui.selected);
  function requestClose(ids: string[], quit = false) {
    if (
      workspaceRef.current.latest.current.sessions.some(
        (session) => ids.includes(session.snapshot.id) && Object.keys(session.edits).length,
      )
    ) {
      setCloseIntent({ ids, quit });
      return;
    }
    void workspaceRef.current.close(ids).then((closed) => {
      if (closed && quit) void exitApp();
    });
  }
  const menuAction = useRef<(action: string) => void>(() => {});
  menuAction.current = (action) => {
    const current = workspaceRef.current;
    const id = current.latest.current.activeId;
    if (action === 'open') void current.open();
    else if (action === 'folder') void folderAction.current();
    else if (action === 'sources') setSourcesOpen(true);
    else if (action === 'recent') {
      if (current.recent[0]) void current.open(current.recent[0]);
    } else if (action === 'save' && id) void current.save(id);
    else if (action === 'save-as' && id) void current.save(id, true);
    else if (action === 'close' && id) requestClose([id]);
    else if (action === 'close-all')
      requestClose(current.latest.current.sessions.map((s) => s.snapshot.id));
    else if (action === 'quit')
      requestClose(
        current.latest.current.sessions.map((s) => s.snapshot.id),
        true,
      );
    else if (['table', 'tree', 'raw', 'trace'].includes(action) && id) {
      const session = current.latest.current.sessions.find((s) => s.snapshot.id === id);
      if (action !== 'trace' || session?.snapshot.trace) current.ui(id, { view: action as View });
    } else if (action === 'theme') setMode(mode === 'dark' ? 'light' : 'dark');
    else if (action === 'zoom-in') setZoom((value) => Math.min(1.5, +(value + 0.1).toFixed(1)));
    else if (action === 'zoom-out') setZoom((value) => Math.max(0.8, +(value - 0.1).toFixed(1)));
    else if (action === 'zoom-reset') setZoom(1);
    else if (action === 'copy-json' && selected)
      void navigator.clipboard.writeText(stringify(selected.value, true)).catch(current.report);
  };
  useEffect(() => {
    let stopped = false;
    let cleanup: (() => void) | undefined;
    bindNative(
      (id) => void workspaceRef.current.request(id, 'refresh'),
      (paths) => {
        for (const path of paths) void workspaceRef.current.open(path);
      },
      (action) => menuAction.current(action),
      () => menuAction.current('quit'),
    )
      .then((dispose) => {
        if (stopped) dispose();
        else cleanup = dispose;
      })
      .catch(workspace.report);
    if (isNative)
      void api
        .startup()
        .then((paths) => {
          for (const path of paths) void workspaceRef.current.open(path);
        })
        .catch(workspace.report);
    return () => {
      stopped = true;
      cleanup?.();
    };
  }, []);
  useEffect(() => {
    setSiblings([]);
    if (!active?.snapshot.trace) return;
    let alive = true;
    const directory = active.snapshot.path.replace(/[\\/][^\\/]+$/, '');
    api
      .list(directory)
      .then((entries) => {
        if (alive) setSiblings(entries);
      })
      .catch(workspace.report);
    return () => {
      alive = false;
    };
  }, [active?.snapshot.path, active?.snapshot.trace?.id]);
  async function related(id: string) {
    const target = workspace.state.sessions.find((s) => s.snapshot.trace?.id === id);
    if (target) workspace.dispatch({ type: 'activate', id: target.snapshot.id });
    else {
      const file = siblings.find((entry) => entry.trace?.id === id);
      if (file) await workspace.open(file.path);
      else workspace.report(t('sessionNotFound', { id }));
    }
  }
  const activeIndex = workspace.state.sessions.findIndex(
    (s) => s.snapshot.id === workspace.state.activeId,
  );
  return (
    <div className="app-root" style={{ zoom, '--app-zoom': zoom } as CSSProperties}>
      <AppShell
        variant="section"
        contentPadding={0}
        style={{ height: `calc(100dvh / ${zoom})` }}
        topNav={
          <TopNav
            label={t('applicationActions')}
            heading={
              <TopNavHeading
                heading="JSONL Viewer"
                logo={<img src={appLogo} width={24} height={24} alt="" />}
              />
            }
            endContent={
              <Stack direction="horizontal" gap={2} align="center">
                <Button
                  label={t('openFile')}
                  icon={<FileJson size={16} />}
                  variant="primary"
                  onClick={() => void workspace.open()}
                />
                <MoreMenu
                  label={t('recentFiles')}
                  items={
                    workspace.recent.length
                      ? [
                          ...workspace.recent.map((path) => ({
                            label: path.split(/[\\/]/).at(-1) ?? path,
                            description: path,
                            onClick: () => void workspace.open(path),
                          })),
                          { label: t('clearHistory'), onClick: () => workspace.setRecent([]) },
                        ]
                      : [{ label: t('noRecentFiles'), isDisabled: true }]
                  }
                />
                <Selector
                  label={t('themeMode')}
                  isLabelHidden
                  value={mode}
                  onChange={(value) => setMode(value as 'light' | 'dark' | 'system')}
                  options={[
                    { value: 'light', label: t('light') },
                    { value: 'dark', label: t('dark') },
                    { value: 'system', label: t('system') },
                  ]}
                  width={112}
                />
                <IconButton
                  label={t('zoomOut')}
                  icon={<Minus size={15} />}
                  variant="ghost"
                  isDisabled={zoom <= 0.8}
                  onClick={() => menuAction.current('zoom-out')}
                />
                <Button
                  label={`${Math.round(zoom * 100)}%`}
                  variant="ghost"
                  onClick={() => setZoom(1)}
                />
                <IconButton
                  label={t('zoomIn')}
                  icon={<Plus size={15} />}
                  variant="ghost"
                  isDisabled={zoom >= 1.5}
                  onClick={() => menuAction.current('zoom-in')}
                />
              </Stack>
            }
          />
        }
        sideNav={
          <Explorer
            workspace={workspace}
            onSources={() => setSourcesOpen(true)}
            onClose={(id) => requestClose([id])}
            onFolderReady={(action) => {
              folderAction.current = action;
            }}
          />
        }
      >
        <div className="workspace">
          {workspace.state.sessions.length ? (
            <Stack direction="horizontal" align="center" className="file-tabs">
              <TabList
                value={workspace.state.activeId ?? ''}
                onChange={(id) => workspace.dispatch({ type: 'activate', id })}
                hasDivider
                aria-label={t('openFiles')}
                className="tabs-grow"
              >
                {workspace.state.sessions.map((session) => (
                  <div key={session.snapshot.id} className="file-tab file-item">
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
                      onClick={() => requestClose([session.snapshot.id])}
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
                      requestClose(
                        workspace.state.sessions
                          .filter((s) => s !== active)
                          .map((s) => s.snapshot.id),
                      ),
                  },
                  {
                    label: t('closeRight'),
                    onClick: () =>
                      requestClose(
                        workspace.state.sessions.slice(activeIndex + 1).map((s) => s.snapshot.id),
                      ),
                  },
                  {
                    label: t('closeAll'),
                    onClick: () => requestClose(workspace.state.sessions.map((s) => s.snapshot.id)),
                  },
                ]}
              />
            </Stack>
          ) : null}
          {active ? (
            <>
              <Stack
                direction="horizontal"
                justify="between"
                align="center"
                paddingInline={4}
                paddingBlock={3}
              >
                <Stack gap={1}>
                  <Heading level={1}>{active.snapshot.name}</Heading>
                  <Text type="code" color="secondary" maxLines={1} hasTruncateTooltip>
                    {active.snapshot.path}
                  </Text>
                </Stack>
                {active.ui.changed ? <Text color="secondary">{t('diskChanged')}</Text> : null}
              </Stack>
              <FileToolbar session={active} workspace={workspace} />
              {active.ui.view === 'trace' &&
              siblings.some(
                (entry) => entry.trace?.parentThreadId === active.snapshot.trace?.id,
              ) ? (
                <Stack
                  direction="horizontal"
                  paddingInline={4}
                  paddingBlock={2}
                  gap={2}
                  wrap="wrap"
                >
                  <Text color="secondary">{t('childSessions')}</Text>
                  {siblings
                    .filter((entry) => entry.trace?.parentThreadId === active.snapshot.trace?.id)
                    .map((entry) => (
                      <Button
                        key={entry.path}
                        label={entry.trace?.agentRole ?? entry.name}
                        variant="ghost"
                        onClick={() => void workspace.open(entry.path)}
                      />
                    ))}
                </Stack>
              ) : null}
              <div className="document-body">
                <div className="view-area" key={`${active.snapshot.id}/${active.ui.view}`}>
                  <DeferredView view={active.ui.view}>
                    {active.ui.view === 'trace' && active.snapshot.trace ? (
                      <TraceView
                        trace={active.snapshot.trace}
                        ui={active.ui}
                        onUi={(patch) => workspace.ui(active.snapshot.id, patch)}
                        onRelated={related}
                      />
                    ) : active.ui.view === 'tree' ? (
                      <TreeView lines={filtered} onSelect={selectLine} />
                    ) : active.ui.view === 'raw' ? (
                      <RawView lines={filtered} onSelect={selectLine} />
                    ) : (
                      <TableView lines={filtered} onSelect={selectLine} />
                    )}
                  </DeferredView>
                </div>
              </div>
              <Stack
                direction="horizontal"
                align="center"
                justify="between"
                padding={3}
                className="status-bar"
              >
                <Text color="secondary">
                  {t('fileStatus', {
                    size: bytes(active.snapshot.sizeBytes),
                    loaded: active.snapshot.lines.length,
                    total: active.snapshot.totalLines,
                  })}
                  {lines.some((l) => l.parseError)
                    ? t('jsonErrorCount', { count: lines.filter((l) => l.parseError).length })
                    : ''}
                </Text>
                {active.snapshot.hasMore ? (
                  <Button
                    label={t('loadMore')}
                    isLoading={active.busy}
                    onClick={() => void workspace.request(active.snapshot.id, 'page')}
                  />
                ) : (
                  <Text color="secondary">{t('endOfFile')}</Text>
                )}
              </Stack>
            </>
          ) : (
            <div className="empty-workspace">
              <EmptyState
                title={t('welcomeTitle')}
                description={t('welcomeDescription')}
                icon={<img src={appLogo} width={40} height={40} alt="" />}
                actions={
                  <Stack direction="horizontal" gap={2}>
                    <Button
                      label={t('openFile')}
                      icon={<FileJson size={16} />}
                      variant="primary"
                      onClick={() => void workspace.open()}
                    />
                    <Button
                      label={t('openFolder')}
                      icon={<FolderOpen size={16} />}
                      onClick={() => void folderAction.current()}
                    />
                    <Button
                      label={t('agentSessions')}
                      icon={<MessagesSquare size={16} />}
                      onClick={() => setSourcesOpen(true)}
                    />
                  </Stack>
                }
              />
              <Text color="secondary">
                {t('supportedFiles')}
                {isNative ? t('dropHint') : t('desktopHint')}
              </Text>
            </div>
          )}
        </div>
      </AppShell>
      {active && selected ? (
        <Inspector
          key={`${active.snapshot.id}/${selected.index}/${active.snapshot.revision}`}
          line={selected}
          editMode={active.ui.editMode}
          actions={<DocumentActions session={active} workspace={workspace} />}
          onClose={() => workspace.ui(active.snapshot.id, { selected: null })}
          onEdit={(raw, value, error) =>
            workspace.edit(active.snapshot.id, selected.index, raw, value, error)
          }
          report={workspace.report}
        />
      ) : null}
      {sourcesOpen ? (
        <Suspense fallback={<Spinner />}>
          <SourceDialog
            open
            onClose={() => setSourcesOpen(false)}
            onOpen={(path) => void workspace.open(path)}
            report={workspace.report}
          />
        </Suspense>
      ) : null}
      <Dialog
        isOpen={!!closeIntent}
        onOpenChange={(open) => {
          if (!open) setCloseIntent(null);
        }}
      >
        <Stack gap={4}>
          <DialogHeader title={t('discardTitle')} />
          <Text>{t('discardDescription')}</Text>
          <Stack direction="horizontal" justify="end" gap={2}>
            <Button label={t('continueEditing')} onClick={() => setCloseIntent(null)} />
            <Button
              label={t('discardAndClose')}
              variant="primary"
              onClick={() => {
                const intent = closeIntent!;
                setCloseIntent(null);
                void workspace.close(intent.ids).then((closed) => {
                  if (closed && intent.quit) void exitApp();
                });
              }}
            />
          </Stack>
        </Stack>
      </Dialog>
    </div>
  );
}
