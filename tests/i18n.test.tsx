import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react';
import { useToast } from '@astryxdesign/core/Toast';
import { App } from '../src/App';
import {
  I18nProvider,
  LanguageProvider,
  languagePreference,
  resolveLocale,
  useI18n,
  type MessageKey,
} from '../src/i18n';
import en from '../src/i18n/en.json';
import zhCN from '../src/i18n/zh-CN.json';
import { api, errorMessage } from '../src/lib/bridge';
import { jsonPreview } from '../src/lib/jsonPreview';
import { useWorkspace } from '../src/workspace/useWorkspace';
import type { Snapshot } from '../src/lib/types';

vi.mock('@astryxdesign/core/Toast', async (original) => ({
  ...(await original<typeof import('@astryxdesign/core/Toast')>()),
  useToast: vi.fn(() => vi.fn()),
}));

const preferenceKey = 'jsonl-viewer:2:language';
const snapshot: Snapshot = {
  id: 'document-one',
  path: 'C:/data/one.jsonl',
  name: 'one.jsonl',
  revision: 1,
  sizeBytes: 32,
  totalLines: 1,
  hasMore: false,
  trace: null,
  lines: [
    { index: 0, raw: '{"message":"用户数据"}', value: { message: '用户数据' }, parseError: null },
  ],
};

beforeEach(() => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&') });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('automatic and persistent language', () => {
  it.each(['zh', 'zh-CN', 'zh-TW', 'zh-Hans-CN', 'ZH-hk'])(
    'uses Simplified Chinese for %s',
    (language) => {
      expect(resolveLocale('system', [language])).toBe('zh-CN');
    },
  );
  it.each([['en-US'], ['fr-FR', 'zh-CN'], ['ja-JP'], []])(
    'falls back to English for primary languages %j',
    (...languages) => {
      expect(resolveLocale('system', languages as string[])).toBe('en');
    },
  );
  it('validates stored preferences and lets an explicit preference override the system', () => {
    for (const value of [null, {}, 7, 'fr', 'zh', 'SYSTEM'])
      expect(languagePreference(value)).toBe('system');
    expect(resolveLocale('en', ['zh-CN'])).toBe('en');
    expect(resolveLocale('zh-CN', ['en-US'])).toBe('zh-CN');
  });
  it('follows system changes until explicitly selected, persists, and can resume following', () => {
    const languages = vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
    const first = renderHook(useI18n, { wrapper: LanguageProvider });
    expect(first.result.current.locale).toBe('zh-CN');
    expect(first.result.current.preference).toBe('system');
    expect(localStorage.getItem(preferenceKey)).toBeNull();
    act(() => {
      languages.mockReturnValue(['en-US']);
      window.dispatchEvent(new Event('languagechange'));
    });
    expect(first.result.current.t('openFile')).toBe('Open file');
    expect(document.documentElement.lang).toBe('en');
    act(() => first.result.current.setPreference('en'));
    act(() => {
      languages.mockReturnValue(['zh-CN']);
      window.dispatchEvent(new Event('languagechange'));
    });
    expect(first.result.current.locale).toBe('en');
    expect(localStorage.getItem(preferenceKey)).toBe('"en"');
    first.unmount();
    const second = renderHook(useI18n, { wrapper: LanguageProvider });
    expect(second.result.current.locale).toBe('en');
    act(() => second.result.current.setPreference('system'));
    expect(second.result.current.locale).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    second.unmount();
    expect(renderHook(useI18n, { wrapper: LanguageProvider }).result.current.preference).toBe(
      'system',
    );
  });
  it.each(['{"unsupported":true}', '"fr"', 'broken-json'])(
    'treats invalid storage %s as System',
    (stored) => {
      localStorage.setItem(preferenceKey, stored);
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['zh-CN']);
      expect(renderHook(useI18n, { wrapper: LanguageProvider }).result.current.locale).toBe(
        'zh-CN',
      );
    },
  );
});

it('keeps catalogs complete and formats ICU values, plurals, preview summaries and coded errors', () => {
  expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
  let locale: 'en' | 'zh-CN' = 'en';
  const hook = renderHook(useI18n, {
    wrapper: ({ children }) => <I18nProvider locale={locale}>{children}</I18nProvider>,
  });
  for (const next of ['en', 'zh-CN'] as const) {
    locale = next;
    hook.rerender();
    const { t } = hook.result.current;
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(
        t(key, {
          count: 2,
          line: 7,
          name: 'file',
          id: 'id',
          view: 'Table',
          size: '1 KB',
          loaded: 1000,
          total: 6001,
          harness: 'Codex',
          messages: 2,
          calls: 1,
          input: 12,
          output: 8,
          message: 'parser detail',
        }),
      ).not.toBe(key);
    }
    expect(t('fileStatus', { size: '1 KB', loaded: 1000, total: 6001 })).toContain('1,000');
    expect(errorMessage({ code: 'conflict', message: 'ignored raw message' }, t)).toBe(
      t('conflictError'),
    );
    expect(
      errorMessage({ code: 'invalid_edit', line: 7, detail: 'parser detail', message: 'raw' }, t),
    ).toContain('parser detail');
    expect(errorMessage({ code: 'io', message: 'OS detail' }, t)).toContain('OS detail');
    expect(errorMessage({ code: 'unknown', message: 'diagnostic' }, t)).toBe('diagnostic');
    expect(errorMessage(undefined, t)).toBe(t('operationFailed'));
    expect(jsonPreview({ payload: [1] }, t)).toBe(`{payload: ${t('array')} (1)}`);
  }
  locale = 'en';
  hook.rerender();
  expect(hook.result.current.t('newRecords', { count: 1 })).toBe('1 new record · Follow latest');
  expect(hook.result.current.t('newRecords', { count: 2 })).toBe('2 new records · Follow latest');
});

async function chooseLanguage(label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: /Language|语言/ }));
  fireEvent.click(await screen.findByRole('option', { name: label }));
}

it('switches the actual app controls and Astryx strings without losing the file or unfinished draft', async () => {
  vi.spyOn(api, 'open').mockResolvedValue(snapshot);
  vi.spyOn(api, 'list').mockResolvedValue([]);
  render(
    <LanguageProvider>
      <App />
    </LanguageProvider>,
  );
  expect(screen.getByText('Open your JSONL file')).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'File browser' })).getByRole('button', {
      name: 'File',
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Inspect line 1' }, { timeout: 5000 }));
  const inspector = screen.getByRole('complementary', { name: 'Row details' });
  fireEvent.click(within(inspector).getByRole('button', { name: 'Edit' }));
  const input = within(inspector).getByRole('textbox', { name: 'Edit JSON' });
  fireEvent.change(input, { target: { value: '{"message":' } });
  expect(
    within(inspector).getByRole('button', { name: 'Save' }).getAttribute('aria-disabled'),
  ).toBe('true');
  await chooseLanguage('简体中文');
  expect(screen.getByRole('textbox', { name: '编辑 JSON' })).toBe(input);
  expect((input as HTMLTextAreaElement).value).toBe('{"message":');
  expect(screen.getByRole('complementary', { name: '行详情' })).toBe(inspector);
  expect(screen.getByRole('button', { name: '表格' })).toBeTruthy();
  // Component-owned copy affordances use the same selected locale.
  expect(screen.getByRole('button', { name: '复制 JSON' })).toBeTruthy();
  expect(localStorage.getItem(preferenceKey)).toBe('"zh-CN"');
  await chooseLanguage('English');
  expect(screen.getByRole('textbox', { name: 'Edit JSON' })).toBe(input);
  expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-current')).toBe('true');
  expect(screen.getByRole('heading', { name: 'one.jsonl' })).toBeTruthy();
  expect(api.open).toHaveBeenCalledTimes(1);
}, 15000);

it.each(['success', 'failure'])(
  'uses the current language when an in-flight save finishes with %s',
  async (outcome) => {
    const toast = vi.fn();
    vi.mocked(useToast).mockReturnValue(toast);
    vi.spyOn(api, 'open').mockResolvedValue(snapshot);
    let resolve!: (value: Snapshot) => void;
    let reject!: (error: unknown) => void;
    vi.spyOn(api, 'save').mockReturnValue(
      new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      }),
    );
    const hook = renderHook(() => ({ ...useWorkspace(), ...useI18n() }), {
      wrapper: LanguageProvider,
    });
    await act(() => hook.result.current.open());
    act(() =>
      hook.result.current.edit(snapshot.id, 0, '{"message":"draft"}', { message: 'draft' }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = hook.result.current.save(snapshot.id);
    });
    act(() => hook.result.current.setPreference('zh-CN'));
    await act(async () => {
      if (outcome === 'success') resolve({ ...snapshot, revision: 2 });
      else reject({ code: 'conflict', message: 'raw backend error' });
      await pending;
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ body: outcome === 'success' ? zhCN.saved : zhCN.conflictError }),
    );
  },
);
