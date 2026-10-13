"use client";

import { Button } from "./controls";
import { useLocale } from "@/components/locale-provider";

export function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  return <div className="language-switch" role="group" aria-label="Language / Bahasa">
    <Button type="button" className="language-option" aria-label="English" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</Button>
    <Button type="button" className="language-option" aria-label="Bahasa Indonesia" aria-pressed={locale === "id"} onClick={() => setLocale("id")}>ID</Button>
  </div>;
}
