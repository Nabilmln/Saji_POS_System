"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircleIcon, XIcon } from "@phosphor-icons/react";
import { useLocale } from "@/components/locale-provider";

export function Toast({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(true);
  useEffect(() => { const timer = window.setTimeout(() => setVisible(false), 10_000); return () => window.clearTimeout(timer); }, []);
  if (!visible || typeof document === "undefined") return null;
  return createPortal(<div className="toast inline-alert info" role="status" aria-live="polite"><CheckCircleIcon size={20} aria-hidden="true" /><span>{children}</span><button type="button" className="icon-button" aria-label={t("Tutup notifikasi")} onClick={() => setVisible(false)}><XIcon size={16} /></button></div>, document.body);
}
