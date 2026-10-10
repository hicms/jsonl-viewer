import * as testing from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider } from '../src/i18n';

function ChineseProvider({ children }: { children: ReactNode }) {
  return <I18nProvider locale="zh-CN">{children}</I18nProvider>;
}

export const render = (ui: ReactNode, options?: testing.RenderOptions) =>
  testing.render(ui, { wrapper: ChineseProvider, ...options });
export const renderHook: typeof testing.renderHook = (callback, options) =>
  testing.renderHook(callback, { wrapper: ChineseProvider, ...options });
