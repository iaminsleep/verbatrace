import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { ru, type Strings } from "./ru";

export type Locale = "ru" | "en";

const DICTIONARIES: Record<Locale, Strings> = { ru, en };
const STORAGE_KEY = "verbatrace-locale";

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {

  }
  return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

interface LocaleValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Strings;
}

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {

    }
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({ locale, setLocale, t: DICTIONARIES[locale] }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useT(): Strings {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useT вне LocaleProvider");
  return value.t;
}

export function useLocale(): Omit<LocaleValue, "t"> {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale вне LocaleProvider");
  return value;
}
