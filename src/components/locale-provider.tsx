"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readLocale, translate, type Locale, type Values } from "@/lib/i18n/translate";
import { formatIdr } from "@/lib/customer/cart";

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void; t: (text: string, values?: Values) => string; money: typeof formatIdr } | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("id");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { updateLocale(readLocale(localStorage.getItem("saji:locale"))); } catch { /* Language selection still works without storage. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({
    locale,
    setLocale: (next: Locale) => { updateLocale(next); try { localStorage.setItem("saji:locale", next); } catch { /* Keep the selection for this page. */ } },
    t: (text: string, values?: Values) => translate(locale, text, values),
    money: (amount: bigint | string) => formatIdr(amount),
  }), [locale]);
  return <LocaleContext value={value}>{children}</LocaleContext>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("LocaleProvider is required");
  return context;
}

export function Text({ value }: { value: string }) {
  return useLocale().t(value);
}
