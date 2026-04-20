"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";

type ThemeMode = "light" | "dark";
const THEME_KEY = "dsn_theme";

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const { t } = useLanguage();

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    const initial: ThemeMode = stored === "dark" ? "dark" : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const setMode = (mode: ThemeMode) => {
    setTheme(mode);
    localStorage.setItem(THEME_KEY, mode);
    applyTheme(mode);
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1">
      <Button
        type="button"
        size="sm"
        variant={theme === "light" ? "default" : "ghost"}
        onClick={() => setMode("light")}
        className="h-8 px-2"
      >
        <Sun className="h-4 w-4" />
        {t("theme.light")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={theme === "dark" ? "default" : "ghost"}
        onClick={() => setMode("dark")}
        className="h-8 px-2"
      >
        <Moon className="h-4 w-4" />
        {t("theme.dark")}
      </Button>
    </div>
  );
}
