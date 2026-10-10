import { StrictMode, lazy, useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { DeferredView } from '../src/components/DeferredView';

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
beforeEach(() => {
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function nextPaint() {
  await act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  });
}

function Content({ name, mount }: { name: string; mount: (name: string) => void }) {
  useEffect(() => mount(name), [name, mount]);
  return <div>{name}</div>;
}

it('shows official Skeleton before the data view is constructed, including StrictMode', async () => {
  const mount = vi.fn();
  const { container } = render(
    <StrictMode>
      <DeferredView view="table">
        <Content name="table content" mount={mount} />
      </DeferredView>
    </StrictMode>,
  );
  const status = screen.getByRole('status', { name: '正在加载表格' });
  expect(status.getAttribute('aria-busy')).toBe('true');
  expect(container.querySelectorAll('.astryx-skeleton').length).toBeGreaterThan(0);
  expect(mount).not.toHaveBeenCalled();
  await nextPaint();
  expect(screen.getByRole('status', { name: '正在加载表格' })).toBeTruthy();
  expect(mount).not.toHaveBeenCalled();
  await nextPaint();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByText('table content')).toBeTruthy();
  expect(mount).toHaveBeenCalledWith('table content');
});

it.each([0, 1])('cancels a replaced document/view after %i frames', async (paints) => {
  const mount = vi.fn();
  const { rerender } = render(
    <DeferredView key="first/table" view="table">
      <Content name="stale table" mount={mount} />
    </DeferredView>,
  );
  if (paints) await nextPaint();
  rerender(
    <DeferredView key="second/tree" view="tree">
      <Content name="latest tree" mount={mount} />
    </DeferredView>,
  );
  expect(screen.queryByRole('status', { name: '正在加载表格' })).toBeNull();
  expect(screen.getByRole('status', { name: '正在加载树形' })).toBeTruthy();
  await nextPaint();
  await nextPaint();
  expect(mount).toHaveBeenCalledExactlyOnceWith('latest tree');
  expect(screen.queryByText('stale table')).toBeNull();
});

it('cancels an unmounted view and keeps same-view updates ready', async () => {
  const mount = vi.fn();
  const first = render(
    <DeferredView view="tree">
      <Content name="closed tree" mount={mount} />
    </DeferredView>,
  );
  await nextPaint();
  first.unmount();
  await nextPaint();
  expect(mount).not.toHaveBeenCalled();
  const current = render(
    <DeferredView view="tree">
      <div>revision 1</div>
    </DeferredView>,
  );
  await nextPaint();
  await nextPaint();
  current.rerender(
    <DeferredView view="tree">
      <div>revision 2</div>
    </DeferredView>,
  );
  expect(screen.getByText('revision 2')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  expect(frames.size).toBe(0);
});

it('keeps the same Skeleton while a lazy view module is loading', async () => {
  let resolve!: (value: { default: () => React.ReactNode }) => void;
  const View = lazy(
    () => new Promise<{ default: () => React.ReactNode }>((done) => (resolve = done)),
  );
  render(
    <DeferredView view="trace">
      <View />
    </DeferredView>,
  );
  await nextPaint();
  await nextPaint();
  expect(screen.getByRole('status', { name: '正在加载会话' })).toBeTruthy();
  await act(async () => resolve({ default: () => <div>loaded trace</div> }));
  expect(screen.getByText('loaded trace')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
});
