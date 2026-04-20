"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Language, translations } from "@/lib/i18n/translations";

const LANGUAGE_KEY = "dsn_language";

type Vars = Record<string, string | number>;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, vars?: Vars) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function resolveTranslation(lang: Language, key: string): string | null {
  const parts = key.split(".");
  let current: unknown = translations[lang];
  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : null;
}

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    text
  );
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("tr");

  useEffect(() => {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored === "en" || stored === "tr") {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_KEY, lang);
  };

  const value = useMemo<LanguageContextType>(
    () => ({
      language,
      setLanguage,
      t: (key: string, vars?: Vars) => {
        const byCurrent = resolveTranslation(language, key);
        const fallback = resolveTranslation("tr", key);
        const text = byCurrent ?? fallback ?? key;
        return interpolate(text, vars);
      },
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
