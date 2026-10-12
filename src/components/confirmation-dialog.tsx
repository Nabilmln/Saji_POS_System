"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ConfirmationDialog({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); trigger?.focus(); };
  }, []);
  return <dialog ref={dialog} className="pos-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}
