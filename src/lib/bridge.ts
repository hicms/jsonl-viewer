import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Entry, Snapshot, Source } from './types';

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
};
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return typeof error === 'string' ? error : '操作失败';
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
