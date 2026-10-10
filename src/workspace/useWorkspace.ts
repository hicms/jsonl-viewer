import { useReducer, useRef } from 'react';
import { useToast } from '@astryxdesign/core/Toast';
import { api, errorMessage } from '../lib/bridge';
import { usePreference } from '../lib/preferences';
import type { FileUi, Json } from '../lib/types';
import { emptyWorkspace, reducer } from './reducer';
import { useI18n } from '../i18n';

export function useWorkspace() {
  const { t } = useI18n();
  const translation = useRef(t);
  translation.current = t;
  const [state, dispatch] = useReducer(reducer, emptyWorkspace);
  const latest = useRef(state);
  latest.current = state;
  const running = useRef(new Set<string>());
  const queued = useRef(new Set<string>());
  const [recent, setRecent] = usePreference<string[]>('recent', []);
  const [order, setOrder] = usePreference<'oldest' | 'newest'>('traceOrder', 'oldest');
  const toast = useToast();
  const report = (error: unknown) =>
    toast({ body: errorMessage(error, translation.current), type: 'error' });

  async function open(path?: string) {
    try {
      const snapshot = await api.open(path);
      if (!snapshot) return;
      dispatch({ type: 'open', snapshot, order });
      setRecent((paths) =>
        [snapshot.path, ...paths.filter((p) => p !== snapshot.path)].slice(0, 50),
      );
    } catch (error) {
      report(error);
    }
  }
  async function request(id: string, kind: 'page' | 'refresh') {
    const session = latest.current.sessions.find((s) => s.snapshot.id === id);
    if (!session) return;
    if (kind === 'refresh' && (Object.keys(session.edits).length || session.ui.editMode)) {
      dispatch({ type: 'ui', id, patch: { changed: true } });
      return;
    }
    if (running.current.has(id)) {
      if (kind === 'refresh') queued.current.add(id);
      return;
    }
    running.current.add(id);
    dispatch({ type: 'busy', id, busy: true });
    try {
      const snapshot = await api[kind](id, session.snapshot.revision);
      dispatch({
        type: 'snapshot',
        id,
        snapshot,
        expectedRevision: session.snapshot.revision,
        kind,
      });
    } catch (error) {
      report(error);
    } finally {
      running.current.delete(id);
      dispatch({ type: 'busy', id, busy: false });
      if (queued.current.delete(id))
        setTimeout(() => {
          void request(id, 'refresh');
        }, 0);
    }
  }
  async function save(id: string, saveAs = false) {
    const session = latest.current.sessions.find((s) => s.snapshot.id === id);
    if (!session || running.current.has(id)) return;
    if (Object.values(session.edits).some((patch) => patch.parseError)) {
      report(translation.current('fixJson'));
      return;
    }
    running.current.add(id);
    dispatch({ type: 'busy', id, busy: true });
    const submitted = session.edits;
    try {
      const snapshot = await api.save(
        id,
        session.snapshot.revision,
        Object.entries(submitted).map(([index, patch]) => ({
          index: Number(index),
          raw: patch.raw,
          original: patch.original,
        })),
        saveAs,
      );
      if (snapshot) {
        dispatch({
          type: 'saved',
          id,
          snapshot,
          expectedRevision: session.snapshot.revision,
          submitted,
          saveAs,
        });
        toast({ body: translation.current(saveAs ? 'savedCopy' : 'saved') });
      }
    } catch (error) {
      report(error);
    } finally {
      running.current.delete(id);
      dispatch({ type: 'busy', id, busy: false });
      if (queued.current.delete(id))
        setTimeout(() => {
          void request(id, 'refresh');
        }, 0);
    }
  }
  async function close(ids: string[]) {
    try {
      await Promise.all(ids.map((id) => api.close(id)));
      dispatch({ type: 'close', ids });
      return true;
    } catch (error) {
      report(error);
      return false;
    }
  }
  const ui = (id: string, patch: Partial<FileUi>) => {
    if (patch.order) setOrder(patch.order);
    dispatch({ type: 'ui', id, patch });
  };
  const edit = (
    id: string,
    index: number,
    raw: string,
    value: Json,
    parseError: string | null = null,
  ) => dispatch({ type: 'edit', id, index, raw, value, parseError });
  return {
    state,
    dispatch,
    latest,
    recent,
    setRecent,
    open,
    request,
    save,
    close,
    ui,
    edit,
    report,
    active: state.sessions.find((s) => s.snapshot.id === state.activeId),
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
