import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

type WindowAction = 'minimize' | 'maximize' | 'fullscreen' | 'leave-fullscreen' | 'close';

export function useWindowChrome(report: (error: unknown) => void) {
  const [state, setState] = useState({ custom: false, maximized: false, fullscreen: false });
  const pending = useRef(false);
  const reportError = useEffectEvent(report);

  async function run(action: WindowAction) {
    if (pending.current) return;
    pending.current = true;
    try {
      const window = getCurrentWindow();
      if (action === 'minimize') await window.minimize();
      else if (action === 'maximize') await window.toggleMaximize();
      else if (action === 'close') await window.close();
      else await window.setFullscreen(action === 'fullscreen' && !(await window.isFullscreen()));
    } catch (error) {
      report(error);
    } finally {
      pending.current = false;
    }
  }
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.repeat ||
      event.isComposing ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    if (event.key === 'F11' || (event.key === 'Escape' && state.fullscreen)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void run(event.key === 'F11' ? 'fullscreen' : 'leave-fullscreen');
    }
  });

  useEffect(() => {
    if (!isTauri()) return;
    const nativeWindow = getCurrentWindow();
    let stopped = false;
    let generation = 0;
    let dispose: (() => void) | undefined;
    async function sync() {
      const request = ++generation;
      try {
        const [maximized, fullscreen] = await Promise.all([
          nativeWindow.isMaximized(),
          nativeWindow.isFullscreen(),
        ]);
        if (!stopped && request === generation) setState({ custom: true, maximized, fullscreen });
      } catch (error) {
        if (!stopped) reportError(error);
      }
    }
    const handleKey = (event: KeyboardEvent) => onKey(event);
    async function bind() {
      if (await nativeWindow.isDecorated()) return;
      if (stopped) return;
      const unlisten = await nativeWindow.onResized(() => void sync());
      if (stopped) {
        unlisten();
        return;
      }
      dispose = unlisten;
      window.addEventListener('keydown', handleKey, true);
      await sync();
    }
    void bind().catch((error) => {
      if (!stopped) reportError(error);
    });
    return () => {
      stopped = true;
      dispose?.();
      window.removeEventListener('keydown', handleKey, true);
    };
  }, []);

  return { ...state, run };
}
