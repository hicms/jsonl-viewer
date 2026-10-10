import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Entry, Snapshot, Source } from './types';
import type { Locale, MessageKey, Translate } from '../i18n';

export const isNative = isTauri();
export const api = {
  open: (path?: string) => invoke<Snapshot | null>('open_file', { path: path ?? null }),
  page: (id: string, revision: number) => invoke<Snapshot>('load_more', { id, revision }),
  refresh: (id: string, revision: number) => invoke<Snapshot>('refresh_file', { id, revision }),
  save: (
    id: string,
    revision: number,
    edits: { index: number; raw: string; original: string }[],
    saveAs: boolean,
  ) => invoke<Snapshot | null>('save_file', { id, revision, edits, saveAs }),
  close: (id: string) => invoke<void>('close_file', { id }),
  folder: () => invoke<string | null>('choose_folder'),
  list: (path: string) => invoke<Entry[]>('list_dir', { path }),
  sources: () => invoke<Source[]>('trace_sources'),
  startup: () => invoke<string[]>('startup_files'),
  locale: (locale: Locale) => invoke<void>('set_locale', { locale }),
};
const errorKeys: Record<string, MessageKey> = {
  conflict: 'conflictError',
  closed: 'closedError',
  unloaded_edit: 'unloadedEditError',
  multiline_edit: 'multilineEditError',
  invalid_path: 'invalidPathError',
  home_unavailable: 'homeUnavailableError',
};
export function errorMessage(error: unknown, t: Translate): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (Object.hasOwn(errorKeys, code)) return t(errorKeys[code]);
    if (code === 'invalid_edit' && 'line' in error && 'detail' in error)
      return t('invalidEditError', { line: error.line, message: error.detail });
    if (code === 'io' && 'message' in error)
      return t('fileOperationError', { message: error.message });
  }
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return typeof error === 'string' ? error : t('operationFailed');
}
export async function bindNative(
  onChange: (id: string) => void,
  onPaths: (paths: string[]) => void,
  onMenu: (action: string) => void,
  onClose: () => void,
) {
  if (!isNative) return () => {};
  const disposers = await Promise.all([
    listen<string>('document-changed', ({ payload }) => onChange(payload)),
    listen<string[]>('open-paths', ({ payload }) => onPaths(payload)),
    listen<string>('menu-action', ({ payload }) => onMenu(payload)),
    getCurrentWindow().onDragDropEvent(({ payload }) => {
      if (payload.type === 'drop') onPaths(payload.paths);
    }),
    getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      onClose();
    }),
  ]);
  return () => disposers.forEach((dispose) => dispose());
}
export const exitApp = () => getCurrentWindow().destroy();
