import type { Workspace, Snapshot, FileUi, Session, Patch, Json } from '../lib/types';

export const emptyWorkspace: Workspace = { sessions: [], activeId: null, closedIds: [] };
export type Action =
  | { type: 'open'; snapshot: Snapshot; order?: 'oldest' | 'newest' }
  | { type: 'activate'; id: string }
  | { type: 'close'; ids: string[] }
  | { type: 'ui'; id: string; patch: Partial<FileUi> }
  | { type: 'busy'; id: string; busy: boolean }
  | {
      type: 'edit';
      id: string;
      index: number;
      raw: string;
      value: Json;
      parseError?: string | null;
    }
  | {
      type: 'snapshot';
      id: string;
      snapshot: Snapshot;
      expectedRevision: number;
      kind: 'page' | 'refresh';
    }
  | {
      type: 'saved';
      id: string;
      snapshot: Snapshot;
      expectedRevision: number;
      submitted: Record<number, Patch>;
      saveAs: boolean;
    };

export function reducer(state: Workspace, action: Action): Workspace {
  if (action.type === 'open') {
    if (state.closedIds.includes(action.snapshot.id)) return state;
    if (state.sessions.some((s) => s.snapshot.id === action.snapshot.id))
      return { ...state, activeId: action.snapshot.id };
    const session: Session = {
      snapshot: action.snapshot,
      edits: {},
      generation: 0,
      busy: false,
      ui: {
        view: action.snapshot.trace ? 'trace' : 'table',
        filter: '',
        selected: null,
        editMode: false,
        order: action.order ?? 'oldest',
        wide: false,
        expanded: true,
        follow: true,
        pending: 0,
        live: false,
        changed: false,
      },
    };
    return { ...state, sessions: [...state.sessions, session], activeId: action.snapshot.id };
  }
  if (action.type === 'activate') return { ...state, activeId: action.id };
  if (action.type === 'close') {
    const sessions = state.sessions.filter((s) => !action.ids.includes(s.snapshot.id));
    return {
      sessions,
      closedIds: [...new Set([...state.closedIds, ...action.ids])],
      activeId: sessions.some((s) => s.snapshot.id === state.activeId)
        ? state.activeId
        : (sessions.at(-1)?.snapshot.id ?? null),
    };
  }
  return {
    ...state,
    sessions: state.sessions.map((session) => {
      if (session.snapshot.id !== action.id) return session;
      switch (action.type) {
        case 'ui':
          return { ...session, ui: { ...session.ui, ...action.patch } };
        case 'busy':
          return { ...session, busy: action.busy };
        case 'edit': {
          const generation = session.generation + 1;
          const original =
            session.edits[action.index]?.original ??
            session.snapshot.lines.find((line) => line.index === action.index)?.raw ??
            '';
          return {
            ...session,
            generation,
            edits: {
              ...session.edits,
              [action.index]: {
                raw: action.raw,
                value: action.value,
                generation,
                original,
                parseError: action.parseError ?? null,
              },
            },
          };
        }
        case 'snapshot': {
          if (session.snapshot.revision !== action.expectedRevision) return session;
          const before = session.snapshot.trace?.items.length ?? session.snapshot.lines.length;
          const after = action.snapshot.trace?.items.length ?? action.snapshot.lines.length;
          return {
            ...session,
            snapshot: action.snapshot,
            ui: {
              ...session.ui,
              changed: action.kind === 'refresh' && !!Object.keys(session.edits).length,
              live: action.kind === 'refresh',
              pending: session.ui.follow ? 0 : session.ui.pending + Math.max(0, after - before),
            },
          };
        }
        case 'saved': {
          if (
            session.snapshot.revision !== action.expectedRevision ||
            (action.saveAs && action.snapshot.revision === action.expectedRevision)
          )
            return session;
          const edits = { ...session.edits };
          for (const [index, patch] of Object.entries(action.submitted)) {
            const current = edits[Number(index)];
            if (current?.generation === patch.generation) delete edits[Number(index)];
            else if (current)
              edits[Number(index)] = {
                ...current,
                original:
                  action.snapshot.lines.find((line) => line.index === Number(index))?.raw ??
                  current.original,
              };
          }
          return {
            ...session,
            snapshot: action.snapshot,
            edits,
            ui: { ...session.ui, changed: false },
          };
        }
      }
    }),
  };
}

export function visibleLines(session: Session) {
  if (Object.keys(session.edits).length === 0) return session.snapshot.lines;
  return session.snapshot.lines.map((line) => {
    const patch = session.edits[line.index];
    return patch
      ? { ...line, raw: patch.raw, value: patch.value, parseError: patch.parseError }
      : line;
  });
}
