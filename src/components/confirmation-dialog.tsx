"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ConfirmationDialog({ titleId, descriptionId, onClose, children, busy = false, className = "pos-dialog" }: { titleId: string; descriptionId?: string; onClose: () => void; children: ReactNode; busy?: boolean; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); trigger?.focus(); };
  }, []);
  return <dialog ref={dialog} className={className} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>{children}</dialog>;
}
