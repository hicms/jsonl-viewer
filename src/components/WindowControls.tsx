import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Minus, Square, Copy, X } from 'lucide-react';
import { useI18n } from '../i18n';
import type { useWindowChrome } from '../lib/useWindowChrome';

export function WindowControls({ chrome }: { chrome: ReturnType<typeof useWindowChrome> }) {
  const { t } = useI18n();
  const [modal, setModal] = useState<HTMLDialogElement | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chrome.custom) return;
    let order: HTMLDialogElement[] = [];
    const sync = (records: MutationRecord[] = []) => {
      const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog:modal')];
      order = order.filter((dialog) => dialogs.includes(dialog));
      for (const dialog of dialogs) if (!order.includes(dialog)) order.push(dialog);
      for (const record of records) {
        if (
          record.type === 'attributes' &&
          record.target instanceof HTMLDialogElement &&
          record.target.matches(':modal')
        ) {
          order = order.filter((dialog) => dialog !== record.target);
          order.push(record.target);
        }
      }
      const focused = document.activeElement?.closest<HTMLDialogElement>('dialog:modal');
      if (focused) {
        order = order.filter((dialog) => dialog !== focused);
        order.push(focused);
      }
      setModal(order.at(-1) ?? null);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    const onFocus = () => sync();
    document.addEventListener('focusin', onFocus);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', onFocus);
    };
  }, [chrome.custom]);
  useLayoutEffect(() => {
    if (modal?.isConnected && modal.matches(':modal') && !chrome.fullscreen)
      controlsRef.current?.showPopover();
  }, [modal, chrome.fullscreen]);
  if (!chrome.custom) return null;
  const maximizeLabel = t(chrome.maximized ? 'restoreWindow' : 'maximizeWindow');
  const controls = (
    <div
      ref={controlsRef}
      popover={modal ? 'manual' : undefined}
      className={`window-controls${modal ? ' window-controls-modal' : ''}`}
      data-tauri-drag-region="false"
      hidden={chrome.fullscreen}
    >
      <IconButton
        label={t('minimizeWindow')}
        tooltip={t('minimizeWindow')}
        icon={<Minus size={15} />}
        variant="ghost"
        onClick={() => void chrome.run('minimize')}
      />
      <IconButton
        label={maximizeLabel}
        tooltip={maximizeLabel}
        icon={chrome.maximized ? <Copy size={13} /> : <Square size={13} />}
        variant="ghost"
        onClick={() => void chrome.run('maximize')}
      />
      <IconButton
        label={t('closeWindow')}
        tooltip={t('closeWindow')}
        icon={<X size={17} />}
        variant="ghost"
        onClick={() => void chrome.run('close')}
      />
    </div>
  );
  // A native modal makes the rest of the WebView inert, including the caption.
  return modal ? (
    <>
      <div className="window-controls-placeholder" />
      {createPortal(controls, modal)}
    </>
  ) : (
    controls
  );
}
