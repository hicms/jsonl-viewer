import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { InternationalizationProvider, useLocale, useTranslator } from '@astryxdesign/core/i18n';
import astryxZhCN from '@astryxdesign/core/locales/zh-CN.generated.js';
import { usePreference } from '../lib/preferences';
import en from './en.json';
import zhCN from './zh-CN.json';

export type Locale = 'en' | 'zh-CN';
export type LanguagePreference = Locale | 'system';
export type MessageKey = keyof typeof en;
export type Translate = (key: MessageKey, values?: Record<string, unknown>) => string;

const chinese: Record<MessageKey, string> = zhCN;
const messages = { en, 'zh-CN': { ...astryxZhCN, ...chinese } };
const LanguageContext = createContext<{
  preference: LanguagePreference;
  setPreference: (value: LanguagePreference) => void;
}>({ preference: 'system', setPreference: () => {} });

export function languagePreference(value: unknown): LanguagePreference {
  return value === 'en' || value === 'zh-CN' ? value : 'system';
}

export function resolveLocale(
  preference: LanguagePreference,
  languages: readonly string[],
): Locale {
  if (preference !== 'system') return preference;
  return /^zh(?:-|$)/i.test(languages[0] ?? '') ? 'zh-CN' : 'en';
}

function systemLanguages() {
  return navigator.languages.length ? navigator.languages : [navigator.language];
}

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <InternationalizationProvider locale={locale} messages={messages}>
      {children}
    </InternationalizationProvider>
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePreference<unknown>('language', 'system');
  const preference = languagePreference(stored);
  const [languages, setLanguages] = useState(systemLanguages);
  const locale = resolveLocale(preference, languages);
  useEffect(() => {
    const changed = () => setLanguages(systemLanguages());
    window.addEventListener('languagechange', changed);
    return () => window.removeEventListener('languagechange', changed);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(
    () => ({ preference, setPreference: (next: LanguagePreference) => setStored(next) }),
    [preference],
  );
  return (
    <LanguageContext.Provider value={value}>
      <I18nProvider locale={locale}>{children}</I18nProvider>
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const language = useContext(LanguageContext);
  const locale = useLocale() as Locale;
  const t: Translate = useTranslator();
  return { ...language, locale, t };
}
