import { describe, it, expect } from 'vitest';
import { reducer, emptyWorkspace, visibleLines } from '../src/workspace/reducer';
import type { Snapshot, Workspace } from '../src/lib/types';

const snapshot = (id = '1', revision = 1): Snapshot => ({
  id,
  revision,
  path: `C:/data/${id}.jsonl`,
  name: `${id}.jsonl`,
  sizeBytes: 20,
  totalLines: 2,
  hasMore: false,
  trace: null,
  lines: [{ index: 0, raw: '{"a":1}', value: { a: 1 }, parseError: null }],
});
const opened = (): Workspace => reducer(emptyWorkspace, { type: 'open', snapshot: snapshot() });

describe('document ownership and async responses', () => {
  it('retains each file view and draft while switching', () => {
    let state = opened();
    state = reducer(state, { type: 'edit', id: '1', index: 0, raw: '{"a":2}', value: { a: 2 } });
    state = reducer(state, { type: 'ui', id: '1', patch: { view: 'raw', filter: '2' } });
    state = reducer(state, { type: 'open', snapshot: snapshot('2') });
    state = reducer(state, { type: 'activate', id: '1' });
    expect(state.sessions[0].ui.view).toBe('raw');
    expect(visibleLines(state.sessions[0])[0].value).toEqual({ a: 2 });
  });
  it('save response acknowledges only submitted generation, retaining later edits', () => {
    let state = reducer(opened(), {
      type: 'edit',
      id: '1',
      index: 0,
      raw: '{"a":2}',
      value: { a: 2 },
    });
    const submitted = state.sessions[0].edits;
    state = reducer(state, { type: 'edit', id: '1', index: 0, raw: '{"a":3}', value: { a: 3 } });
    state = reducer(state, {
      type: 'saved',
      id: '1',
      snapshot: snapshot('1', 2),
      expectedRevision: 1,
      submitted,
      saveAs: false,
    });
    expect(visibleLines(state.sessions[0])[0].value).toEqual({ a: 3 });
    expect(Object.keys(state.sessions[0].edits)).toHaveLength(1);
    expect(state.sessions[0].snapshot.revision).toBe(2);
  });
  it('successful save clears exactly the saved patches', () => {
    let state = reducer(opened(), {
      type: 'edit',
      id: '1',
      index: 0,
      raw: '{"a":2}',
      value: { a: 2 },
    });
    state = reducer(state, {
      type: 'saved',
      id: '1',
      snapshot: snapshot('1', 2),
      expectedRevision: 1,
      submitted: state.sessions[0].edits,
      saveAs: false,
    });
    expect(state.sessions[0].edits).toEqual({});
  });
  it('late reload does not overwrite an edit made after request', () => {
    let state = reducer(opened(), {
      type: 'edit',
      id: '1',
      index: 0,
      raw: '{"a":4}',
      value: { a: 4 },
    });
    state = reducer(state, {
      type: 'snapshot',
      id: '1',
      snapshot: snapshot('1', 2),
      expectedRevision: 1,
      kind: 'refresh',
    });
    expect(state.sessions[0].snapshot.revision).toBe(2);
    expect(state.sessions[0].ui.changed).toBe(true);
    expect(visibleLines(state.sessions[0])[0].value).toEqual({ a: 4 });
  });
  it('save-as selecting the source acknowledges the advanced backend revision', () => {
    let state = reducer(opened(), {
      type: 'edit',
      id: '1',
      index: 0,
      raw: '{"a":2}',
      value: { a: 2 },
    });
    state = reducer(state, {
      type: 'saved',
      id: '1',
      snapshot: snapshot('1', 2),
      expectedRevision: 1,
      submitted: state.sessions[0].edits,
      saveAs: true,
    });
    expect(state.sessions[0].edits).toEqual({});
    expect(state.sessions[0].snapshot.revision).toBe(2);
  });
  it('late open cannot resurrect a closed backend identity', () => {
    let state = reducer(opened(), { type: 'close', ids: ['1'] });
    state = reducer(state, { type: 'open', snapshot: snapshot() });
    expect(state.sessions).toHaveLength(0);
  });
  it('page response preserves draft and stale revision cannot regress document', () => {
    let state = reducer(opened(), {
      type: 'edit',
      id: '1',
      index: 0,
      raw: '{"a":5}',
      value: { a: 5 },
    });
    state = reducer(state, {
      type: 'snapshot',
      id: '1',
      snapshot: snapshot('1', 2),
      expectedRevision: 1,
      kind: 'page',
    });
    state = reducer(state, {
      type: 'snapshot',
      id: '1',
      snapshot: snapshot('1', 1),
      expectedRevision: 1,
      kind: 'page',
    });
    expect(state.sessions[0].snapshot.revision).toBe(2);
    expect(visibleLines(state.sessions[0])[0].value).toEqual({ a: 5 });
  });
  it('closed document response cannot affect reopened path with a new identity', () => {
    let state = reducer(opened(), { type: 'close', ids: ['1'] });
    state = reducer(state, { type: 'open', snapshot: { ...snapshot('3'), path: snapshot().path } });
    state = reducer(state, {
      type: 'snapshot',
      id: '1',
      snapshot: snapshot('1', 2),
      expectedRevision: 1,
      kind: 'refresh',
    });
    expect(state.sessions.map((s) => s.snapshot.id)).toEqual(['3']);
  });
  it('save-as leaves source drafts dirty', () => {
    let state = reducer(opened(), {
      type: 'edit',
      id: '1',
      index: 0,
      raw: '{"a":2}',
      value: { a: 2 },
    });
    state = reducer(state, {
      type: 'saved',
      id: '1',
      snapshot: snapshot(),
      expectedRevision: 1,
      submitted: state.sessions[0].edits,
      saveAs: true,
    });
    expect(Object.keys(state.sessions[0].edits)).toHaveLength(1);
  });
  it('closing a folder is independent from document ownership', () => {
    let state = reducer(opened(), { type: 'open', snapshot: snapshot('2') });
    state = reducer(state, { type: 'close', ids: ['2'] });
    expect(state.activeId).toBe('1');
    expect(state.sessions).toHaveLength(1);
  });
});
