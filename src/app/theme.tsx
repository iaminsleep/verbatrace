import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "verbatrace-theme";

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {

  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

interface ThemeValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const first = initialTheme();
    apply(first);
    return first;
  });

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      apply(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {

      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeValue>(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme вне ThemeProvider");
  return value;
}
