import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/500.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/700.css';
import './styles.css';
import { App } from './App';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import zhCN from '@astryxdesign/core/locales/zh-CN.generated.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InternationalizationProvider locale="zh-CN" messages={{ 'zh-CN': zhCN }}>
      <App />
    </InternationalizationProvider>
  </StrictMode>,
);
