"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { useLocale } from "@/components/locale-provider";
import { Button } from "./controls";

type Confirmation = { title: string; description: string; subject?: ReactNode; confirmLabel: string };
const ConfirmationContext = createContext<((options: Confirmation) => Promise<boolean>) | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const pathname = usePathname();
  const id = useId();
  const [request, setRequest] = useState<Confirmation | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const settle = useCallback((accepted: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(accepted);
  }, []);
  const confirm = useCallback((options: Confirmation) => {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => { pending.current = resolve; setRequest(options); });
  }, []);
  // A decision left open during navigation must never authorize the previous page's action.
  useEffect(() => () => settle(false), [pathname, settle]);
  return <ConfirmationContext value={confirm}>{children}{request && <ConfirmationDialog className="confirmation-dialog" titleId={`${id}-title`} descriptionId={`${request.subject ? `${id}-subject ` : ""}${id}-description`} onClose={() => settle(false)}>
    <h2 id={`${id}-title`}>{t(request.title)}</h2>
    {request.subject && <strong className="confirmation-target" id={`${id}-subject`}>{request.subject}</strong>}
    <p id={`${id}-description`}>{t(request.description)}</p>
    <div className="dialog-actions"><Button type="button" className="secondary-button" autoFocus onClick={() => settle(false)}>{t("Batal")}</Button><Button type="button" className="primary-button" onClick={() => settle(true)}>{t(request.confirmLabel)}</Button></div>
  </ConfirmationDialog>}</ConfirmationContext>;
}

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("ConfirmationProvider is required");
  return confirm;
}
