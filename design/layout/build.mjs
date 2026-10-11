import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../..');
const output = path.join(root, '.plan/layout-build');
await build({
  configFile: false,
  root,
  base: './',
  plugins: [react()],
  build: {
    outDir: output,
    emptyOutDir: true,
    assetsInlineLimit: 100000,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.join(directory, 'index.html'),
      output: { inlineDynamicImports: true },
    },
  },
});
let html = readFileSync(path.join(output, 'design/layout/index.html'), 'utf8');
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/, (_, source) => {
  const script = readFileSync(path.resolve(output, 'design/layout', source), 'utf8');
  return `<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script>`;
});
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/, (_, source) => {
  const css = readFileSync(path.resolve(output, 'design/layout', source), 'utf8');
  return `<style>${css}</style>`;
});
writeFileSync(path.join(root, 'design/layout-preview.html'), html);
console.log('Offline prototype: design/layout-preview.html');
