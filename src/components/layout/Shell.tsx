import { Languages, Moon, Sun } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { logEvent } from "../../local/diagnostics";
import { useLocale, useT } from "../../i18n";
import { useTheme } from "../../app/theme";
import { Button } from "../ui/button";
import { Logo } from "../ui/Logo";
import { Tooltip } from "../ui/tooltip";

export function Shell() {
  const t = useT();
  const { theme, toggle } = useTheme();
  const { locale, setLocale } = useLocale();
  const { pathname } = useLocation();
  useEffect(() => {
    const match = /^\/editor\/(\d+)$/.exec(pathname);
    logEvent("navigation", match ? { page: "editor", fileId: Number(match[1]) } : { page: pathname === "/" ? "library" : "other" });
  }, [pathname]);

  return (
    <div className="flex h-dvh min-w-0 flex-col">
      <header className="workspace-header">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-sm text-foreground transition-opacity hover:opacity-80"
        >
          <span className="grid size-8 place-items-center rounded-md bg-accent"><Logo className="size-5" /></span>
          <span className="text-[15px] font-semibold tracking-tight">{t.common.appName}</span>
        </Link>

        <div className="flex items-center gap-1">
          <Tooltip label={t.common.language}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.common.language}
              onClick={() => {
                const next = locale === "ru" ? "en" : "ru";
                logEvent("settings.language", { locale: next });
                setLocale(next);
              }}
            >
              <Languages />
              <span className="sr-only">{locale}</span>
            </Button>
          </Tooltip>

          <Tooltip label={t.common.theme}>
            <Button variant="ghost" size="icon" aria-label={t.common.theme} onClick={() => { logEvent("settings.theme", { theme: theme === "dark" ? "light" : "dark" }); toggle(); }}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </Tooltip>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
