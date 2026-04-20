"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1">
      <Button
        type="button"
        size="sm"
        variant={language === "tr" ? "default" : "ghost"}
        className="h-8 px-2"
        onClick={() => setLanguage("tr")}
      >
        {t("language.tr")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={language === "en" ? "default" : "ghost"}
        className="h-8 px-2"
        onClick={() => setLanguage("en")}
      >
        {t("language.en")}
      </Button>
    </div>
  );
}
