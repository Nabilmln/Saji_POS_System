"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CheckCircleIcon, InfoIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useLocale } from "@/components/locale-provider";

export type ToastTone = "success" | "info" | "warning" | "error";

export function Toast({ children, messageKey = children, tone = "success" }: { children: ReactNode; messageKey?: unknown; tone?: ToastTone }) {
  const { t } = useLocale();
  const [dismissed, setDismissed] = useState<{ key: unknown } | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => setDismissed({ key: messageKey }), 10_000); return () => window.clearTimeout(timer); }, [messageKey]);
  if (dismissed?.key === messageKey || typeof document === "undefined") return null;
  const Icon = tone === "success" ? CheckCircleIcon : tone === "info" ? InfoIcon : WarningCircleIcon;
  return createPortal(<div className="toast inline-alert info" data-tone={tone} role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"} aria-atomic="true"><Icon size={20} aria-hidden="true" /><div className="toast-content">{children}</div><button type="button" className="icon-button" aria-label={t("Tutup notifikasi")} onClick={() => setDismissed({ key: messageKey })}><XIcon size={16} /></button></div>, document.body);
}
