import { useState, type CSSProperties } from 'react';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { TreeList } from '@astryxdesign/core/TreeList';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { ToastViewport, useToast } from '@astryxdesign/core/Toast';
import {
  FileJson,
  FolderOpen,
  Folder,
  MessagesSquare,
  History,
  X,
  Plus,
  Minus,
  Pencil,
  Save,
  Search,
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Maximize2,
  Minimize2,
  ChevronsDownUp,
  ChevronsUpDown,
  Globe,
  Sun,
  Moon,
  Trash2,
  Columns3,
} from 'lucide-react';
import appLogo from '../../src-tauri/icons/icon.svg';
import { I18nProvider, useI18n, type Locale } from '../../src/i18n';
import { TreeView } from '../../src/views/TreeView';
import { RawView } from '../../src/views/RawView';
import { TraceView } from '../../src/views/TraceView';
import { Inspector } from '../../src/views/Inspector';
import type { FileUi, View } from '../../src/lib/types';
import { DataTable } from './DataTable';
import { sampleFile, samples, type DemoFile } from './samples';
import './prototype.css';

export function Prototype() {
  const [mode, setMode] = useState<'light' | 'dark' | 'system'>('light');
  const [locale, setLocale] = useState<Locale>('zh-CN');
  return (
    <I18nProvider locale={locale}>
      <Theme theme={neutralTheme} mode={mode}>
        <ToastViewport position="bottomEnd" inset={{ bottom: 64 }}>
          <Workspace mode={mode} setMode={setMode} locale={locale} setLocale={setLocale} />
        </ToastViewport>
      </Theme>
    </I18nProvider>
  );
}

function Workspace({
  mode,
  setMode,
  locale,
  setLocale,
}: {
  mode: 'light' | 'dark' | 'system';
  setMode: (value: 'light' | 'dark' | 'system') => void;
  locale: Locale;
  setLocale: (value: Locale) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [files, setFiles] = useState<DemoFile[]>([
    sampleFile('logs.jsonl'),
    sampleFile('session.jsonl'),
  ]);
  const [activeName, setActiveName] = useState('logs.jsonl');
  const [zoom, setZoom] = useState(1);
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const [recent, setRecent] = useState([
    'logs.jsonl',
    'session.jsonl',
    'events.ndjson',
    'app.jsonl',
    'trace.jsonl',
  ]);
  const [chooser, setChooser] = useState<'file' | 'session' | null>(null);
  const [closeName, setCloseName] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Record<string, string[]>>({});
  const active = files.find((file) => file.name === activeName);
  const filtered =
    active?.lines.filter((line) =>
      line.raw.toLowerCase().includes(active.ui.filter.toLowerCase()),
    ) ?? [];
  const selected = active?.lines.find((line) => line.index === active.ui.selected);
  const columnKeys = [
    ...new Set(
      active?.lines.flatMap((line) =>
        line.value && typeof line.value === 'object' && !Array.isArray(line.value)
          ? Object.keys(line.value)
          : [],
      ) ?? [],
    ),
  ];
  const note = (zh: string, en: string) => (locale === 'zh-CN' ? zh : en);
  function open(name: string) {
    if (!samples.some((file) => file.name === name)) {
      setChooser('file');
      return;
    }
    if (!files.some((file) => file.name === name))
      setFiles((current) => [...current, sampleFile(name)]);
    setActiveName(name);
    setChooser(null);
  }
  function patch(patch: Partial<FileUi>) {
    setFiles((current) =>
      current.map((file) =>
        file.name === activeName ? { ...file, ui: { ...file.ui, ...patch } } : file,
      ),
    );
  }
  function close(name: string, discard = false) {
    if (!discard && files.find((file) => file.name === name)?.dirty) {
      setCloseName(name);
      return;
    }
    const remaining = files.filter((file) => file.name !== name);
    setFiles(remaining);
    if (activeName === name) setActiveName(remaining.at(-1)?.name ?? '');
    setCloseName(null);
  }
  function save() {
    if (!active) return;
    setFiles((current) =>
      current.map((file) => (file.name === activeName ? { ...file, dirty: false } : file)),
    );
    toast({
      body: note(
        '原型草稿已保留，未写入本地文件。',
        'Prototype draft retained; no local file was written.',
      ),
    });
  }
  const editButton =
    active && active.ui.view !== 'trace' ? (
      <IconButton
        label={active.ui.editMode ? t('editing') : t('edit')}
        tooltip={active.ui.editMode ? t('exitEdit') : t('editJson')}
        icon={<Pencil size={16} />}
        variant={active.ui.editMode ? 'primary' : 'ghost'}
        onClick={() => patch({ editMode: !active.ui.editMode, selected: active.ui.selected ?? 0 })}
      />
    ) : null;
  const saveButton = (
    <Button
      label={t('save')}
      icon={<Save size={16} />}
      isDisabled={!active?.dirty || active.lines.some((line) => line.parseError)}
      onClick={save}
    />
  );
  return (
    <div className="prototype" style={{ zoom, '--app-zoom': zoom } as CSSProperties}>
      <AppShell
        variant="section"
        contentPadding={0}
        style={{ height: '100%' }}
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
                <MoreMenu
                  label={t('recentFiles')}
                  icon={<History size={18} />}
                  items={recent.map((name) => ({ label: name, onClick: () => open(name) }))}
                />
                <Button
                  label={t('openFile')}
                  icon={<FolderOpen size={16} />}
                  variant="primary"
                  onClick={() => setChooser('file')}
                />
              </Stack>
            }
          />
        }
        sideNav={
          <SideNav
            aria-label={t('fileBrowser')}
            collapsible
            resizable={{ defaultWidth: 248, minWidth: 180, maxWidth: 440 }}
            header={
              <Stack direction="horizontal" align="center" justify="between" gap={2}>
                <Stack direction="horizontal" align="center" gap={2}>
                  <Folder size={18} />
                  <Text weight="semibold">{t('fileBrowser')}</Text>
                </Stack>
                <IconButton
                  label={t('openFolder')}
                  icon={<FolderOpen size={16} />}
                  variant="ghost"
                  size="sm"
                  onClick={() => setDirectoryOpen(true)}
                />
              </Stack>
            }
            topContent={
              <Stack gap={1}>
                <SideNavItem
                  label={t('file')}
                  icon={<FileJson size={17} />}
                  onClick={() => setChooser('file')}
                />
                <SideNavItem
                  label={t('folder')}
                  icon={<FolderOpen size={17} />}
                  onClick={() => setDirectoryOpen((value) => !value)}
                />
                <SideNavItem
                  label={t('agentSessions')}
                  icon={<MessagesSquare size={17} />}
                  onClick={() => setChooser('session')}
                />
              </Stack>
            }
            footer={
              <Stack padding={2}>
                <div className="demo-preferences">
                  <Stack direction="horizontal" align="center" gap={2}>
                    <Globe size={16} />
                    <Text type="supporting">{t('language')}</Text>
                  </Stack>
                  <Selector
                    label={t('language')}
                    isLabelHidden
                    value={locale}
                    onChange={(value) => setLocale(value as Locale)}
                    width="fill"
                    options={[
                      { value: 'zh-CN', label: '简体中文' },
                      { value: 'en', label: 'English' },
                    ]}
                    size="sm"
                  />
                  <Stack direction="horizontal" align="center" gap={2}>
                    {mode === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                    <Text type="supporting">{t('themeMode')}</Text>
                  </Stack>
                  <Selector
                    label={t('themeMode')}
                    isLabelHidden
                    value={mode}
                    onChange={(value) => setMode(value as typeof mode)}
                    width="fill"
                    size="sm"
                    options={[
                      { value: 'light', label: t('light') },
                      { value: 'dark', label: t('dark') },
                      { value: 'system', label: t('system') },
                    ]}
                  />
                  <Text type="supporting">{note('缩放', 'Zoom')}</Text>
                  <Stack direction="horizontal" align="center" gap={1} className="demo-zoom">
                    <IconButton
                      label={t('zoomOut')}
                      icon={<Minus size={14} />}
                      variant="ghost"
                      size="sm"
                      isDisabled={zoom <= 0.8}
                      onClick={() => setZoom((value) => Math.max(0.8, +(value - 0.1).toFixed(1)))}
                    />
                    <Button
                      label={`${Math.round(zoom * 100)}%`}
                      variant="ghost"
                      size="sm"
                      onClick={() => setZoom(1)}
                    />
                    <IconButton
                      label={t('zoomIn')}
                      icon={<Plus size={14} />}
                      variant="ghost"
                      size="sm"
                      isDisabled={zoom >= 1.5}
                      onClick={() => setZoom((value) => Math.min(1.5, +(value + 0.1).toFixed(1)))}
                    />
                  </Stack>
                </div>
              </Stack>
            }
          >
            <Stack gap={4} paddingBlock={2}>
              {files.length ? (
                <SideNavSection title={t('opened')}>
                  {files.map((file) => (
                    <SideNavItem
                      key={file.name}
                      label={`${file.name}${file.dirty ? ' •' : ''}`}
                      icon={<FileJson size={16} />}
                      isSelected={file.name === activeName}
                      onClick={() => setActiveName(file.name)}
                      actions={
                        <IconButton
                          label={t('closeFile', { name: file.name })}
                          icon={<X size={14} />}
                          variant="ghost"
                          size="sm"
                          onClick={() => close(file.name)}
                        />
                      }
                    />
                  ))}
                </SideNavSection>
              ) : null}
              {directoryOpen ? (
                <SideNavSection
                  title={note('工作目录', 'Directory')}
                  endContent={
                    <IconButton
                      label={t('closeFolder')}
                      icon={<X size={14} />}
                      variant="ghost"
                      size="sm"
                      onClick={() => setDirectoryOpen(false)}
                    />
                  }
                >
                  <TreeList
                    variant="noGuides"
                    density="compact"
                    aria-label={t('directoryFiles')}
                    items={[
                      {
                        id: 'sample',
                        label: 'sample',
                        startContent: <Folder size={16} />,
                        isExpanded: true,
                        children: samples.map((file) => ({
                          id: file.name,
                          label: file.name,
                          startContent: <FileJson size={16} />,
                          isSelected: file.name === activeName,
                          onClick: () => open(file.name),
                        })),
                      },
                    ]}
                  />
                </SideNavSection>
              ) : null}
              <SideNavSection title={t('recentFiles')}>
                {recent.map((name) => (
                  <SideNavItem
                    key={name}
                    label={name}
                    icon={<History size={16} />}
                    onClick={() => open(name)}
                    actions={
                      <IconButton
                        label={t('removeHistory', { name })}
                        icon={<Trash2 size={14} />}
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setRecent((current) => current.filter((item) => item !== name))
                        }
                      />
                    }
                  />
                ))}
              </SideNavSection>
            </Stack>
          </SideNav>
        }
      >
        <div className="demo-workspace">
          {files.length ? (
            <Stack direction="horizontal" align="center" className="demo-tabs">
              <TabList
                value={activeName}
                onChange={setActiveName}
                hasDivider
                aria-label={t('openFiles')}
                className="demo-tabs-list"
              >
                {files.map((file) => (
                  <div key={file.name} className="demo-tab">
                    <Tab
                      value={file.name}
                      label={`${file.name}${file.dirty ? ' •' : ''}`}
                      endContent={<span className="demo-close-space" aria-hidden="true" />}
                    />
                    <IconButton
                      label={t('closeFile', { name: file.name })}
                      icon={<X size={14} />}
                      variant="ghost"
                      size="sm"
                      className="demo-close"
                      onClick={() => close(file.name)}
                    />
                  </div>
                ))}
              </TabList>
              <MoreMenu
                label={t('closeActions')}
                items={[
                  {
                    label: t('closeOthers'),
                    onClick: () => {
                      if (files.some((file) => file.name !== activeName && file.dirty)) {
                        toast({ body: note('请先关闭有草稿的示例文件。', 'Close drafts first.') });
                      } else
                        setFiles((current) => current.filter((file) => file.name === activeName));
                    },
                  },
                  {
                    label: t('closeAll'),
                    onClick: () => {
                      if (files.some((file) => file.dirty))
                        toast({
                          body: note(
                            '请先保存或关闭有草稿的示例文件。',
                            'Save or close drafts first.',
                          ),
                        });
                      else {
                        setFiles([]);
                        setActiveName('');
                      }
                    },
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
                gap={3}
                paddingInline={4}
                paddingBlock={4}
                className="demo-document-header"
              >
                <Stack gap={2} className="demo-identity">
                  <Heading level={3} maxLines={1}>
                    {active.name}
                  </Heading>
                  <Text type="code" color="secondary" maxLines={1}>
                    D:/data/{active.name}
                  </Text>
                </Stack>
                <Stack direction="horizontal" gap={2} align="center" className="demo-actions">
                  {saveButton}
                  {editButton}
                </Stack>
              </Stack>
              <Stack className="demo-toolbar" gap={0}>
                <Stack
                  direction="horizontal"
                  align="center"
                  gap={2}
                  paddingInline={3}
                  className="demo-options-row"
                >
                  <TabList
                    value={active.ui.view}
                    onChange={(value) => patch({ view: value as View, selected: null })}
                    aria-label={t('dataViews')}
                    className="demo-view-tabs"
                  >
                    <Tab value="table" label={t('table')} icon={<FileJson size={16} />} />
                    <Tab value="tree" label={t('tree')} />
                    <Tab value="raw" label={t('raw')} />
                    {active.trace ? (
                      <Tab value="trace" label={t('trace')} icon={<MessagesSquare size={16} />} />
                    ) : null}
                  </TabList>
                  <Stack direction="horizontal" gap={1} className="demo-options">
                    {active.ui.view === 'trace' ? (
                      <>
                        <IconButton
                          label={active.ui.order === 'oldest' ? t('newestFirst') : t('oldestFirst')}
                          tooltip={
                            active.ui.order === 'oldest'
                              ? t('orderOldestHint')
                              : t('orderNewestHint')
                          }
                          icon={
                            active.ui.order === 'oldest' ? (
                              <ArrowDownWideNarrow size={16} />
                            ) : (
                              <ArrowUpWideNarrow size={16} />
                            )
                          }
                          variant="ghost"
                          onClick={() =>
                            patch({ order: active.ui.order === 'oldest' ? 'newest' : 'oldest' })
                          }
                        />
                        <IconButton
                          label={active.ui.wide ? t('compact') : t('wide')}
                          tooltip={active.ui.wide ? t('wideHint') : t('compactHint')}
                          icon={active.ui.wide ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                          variant="ghost"
                          onClick={() => patch({ wide: !active.ui.wide })}
                        />
                        <IconButton
                          label={active.ui.expanded ? t('collapseDetails') : t('expandDetails')}
                          tooltip={
                            active.ui.expanded ? t('collapseDetailsHint') : t('expandDetailsHint')
                          }
                          icon={
                            active.ui.expanded ? (
                              <ChevronsDownUp size={16} />
                            ) : (
                              <ChevronsUpDown size={16} />
                            )
                          }
                          variant="ghost"
                          onClick={() => patch({ expanded: !active.ui.expanded })}
                        />
                      </>
                    ) : null}
                    {active.ui.view === 'table' ? (
                      <MultiSelector
                        label={note('显示列', 'Visible columns')}
                        options={columnKeys.map((key) => ({ value: key, label: key }))}
                        value={columnKeys.filter(
                          (key) => !(hiddenColumns[activeName] ?? []).includes(key),
                        )}
                        onChange={(value) =>
                          setHiddenColumns((current) => ({
                            ...current,
                            [activeName]: columnKeys.filter((key) => !value.includes(key)),
                          }))
                        }
                        renderTrigger={(props) => (
                          <IconButton
                            {...props}
                            label={note('显示列', 'Visible columns')}
                            tooltip={note('显示或隐藏数据列', 'Show or hide columns')}
                            icon={<Columns3 size={16} />}
                            variant="ghost"
                          />
                        )}
                      />
                    ) : null}
                    <MoreMenu
                      label={t('fileActions')}
                      items={[
                        {
                          label: t('saveAs'),
                          onClick: () =>
                            toast({
                              body: note(
                                '这是布局原型，另存为操作由桌面应用提供。',
                                'Save As is available in the desktop application.',
                              ),
                            }),
                        },
                        {
                          label: t('reload'),
                          isDisabled: active.dirty,
                          onClick: () =>
                            setFiles((current) =>
                              current.map((file) =>
                                file.name === activeName ? sampleFile(file.name) : file,
                              ),
                            ),
                        },
                      ]}
                    />
                  </Stack>
                </Stack>
                <Stack direction="horizontal" gap={2} align="center" padding={3}>
                  <div className="demo-search">
                    <TextInput
                      label={t('searchLoaded')}
                      isLabelHidden
                      value={active.ui.filter}
                      onChange={(filter) => patch({ filter })}
                      placeholder={
                        active.ui.view === 'trace' ? t('searchSession') : t('searchJson')
                      }
                      hasClear
                      startIcon={<Search size={16} />}
                      width="fill"
                    />
                  </div>
                </Stack>
              </Stack>
              <div className="demo-content" key={`${active.name}/${active.ui.view}`}>
                {active.ui.view === 'trace' && active.trace ? (
                  <TraceView
                    trace={active.trace}
                    ui={active.ui}
                    onUi={patch}
                    onRelated={() => {}}
                  />
                ) : active.ui.view === 'tree' ? (
                  <TreeView lines={filtered} onSelect={(selected) => patch({ selected })} />
                ) : active.ui.view === 'raw' ? (
                  <RawView lines={filtered} onSelect={(selected) => patch({ selected })} />
                ) : (
                  <DataTable
                    lines={filtered}
                    onSelect={(selected) => patch({ selected })}
                    hidden={hiddenColumns[activeName] ?? []}
                  />
                )}
              </div>
              <Stack
                direction="horizontal"
                justify="between"
                align="center"
                paddingInline={4}
                paddingBlock={3}
                className="demo-status"
              >
                <Text type="supporting">
                  {t('fileStatus', {
                    size: '2.4 KB',
                    loaded: active.lines.length,
                    total: active.lines.length,
                  })}
                  {active.ui.filter ? ` · ${note('匹配', 'Matches')} ${filtered.length}` : ''}
                </Text>
                <Text type="supporting">{t('endOfFile')}</Text>
              </Stack>
            </>
          ) : (
            <div className="demo-placeholder">
              <EmptyState
                title={t('welcomeTitle')}
                description={t('welcomeDescription')}
                icon={<img src={appLogo} width={40} height={40} alt="" />}
                actions={
                  <Button
                    label={t('openFile')}
                    variant="primary"
                    onClick={() => setChooser('file')}
                  />
                }
              />
            </div>
          )}
        </div>
      </AppShell>
      {active && selected ? (
        <Inspector
          key={`${active.name}/${selected.index}`}
          line={selected}
          editMode={active.ui.editMode}
          onClose={() => patch({ selected: null })}
          report={(error) => toast({ body: String(error), type: 'error' })}
          actions={
            <>
              {editButton}
              {saveButton}
            </>
          }
          onEdit={(raw, value, parseError) =>
            setFiles((current) =>
              current.map((file) =>
                file.name === activeName
                  ? {
                      ...file,
                      dirty: true,
                      lines: file.lines.map((line) =>
                        line.index === selected.index ? { ...line, raw, value, parseError } : line,
                      ),
                    }
                  : file,
              ),
            )
          }
        />
      ) : null}
      <Dialog
        isOpen={!!chooser}
        onOpenChange={(open) => {
          if (!open) setChooser(null);
        }}
        width={560}
      >
        <Stack gap={4}>
          <DialogHeader
            title={chooser === 'session' ? t('agentSessions') : t('openFile')}
            subtitle={note(
              '选择示例文件，预览布局与交互。',
              'Choose sample data to preview the layout.',
            )}
            onOpenChange={() => setChooser(null)}
          />
          {samples
            .filter((file) => chooser !== 'session' || file.trace)
            .map((file) => (
              <SideNavItem
                key={file.name}
                label={file.name}
                icon={file.trace ? <MessagesSquare size={18} /> : <FileJson size={18} />}
                onClick={() => open(file.name)}
              />
            ))}
        </Stack>
      </Dialog>
      <Dialog
        isOpen={!!closeName}
        onOpenChange={(open) => {
          if (!open) setCloseName(null);
        }}
        width={480}
      >
        <Stack gap={4}>
          <DialogHeader
            title={t('discardTitle')}
            subtitle={closeName ?? ''}
            onOpenChange={() => setCloseName(null)}
          />
          <Text>
            {note('关闭将丢弃这个示例文件的未保存草稿。', 'Closing discards this sample draft.')}
          </Text>
          <Stack direction="horizontal" justify="end" gap={2}>
            <Button label={t('continueEditing')} onClick={() => setCloseName(null)} />
            <Button
              label={t('discardAndClose')}
              variant="primary"
              onClick={() => {
                if (closeName) close(closeName, true);
              }}
            />
          </Stack>
        </Stack>
      </Dialog>
    </div>
  );
}
