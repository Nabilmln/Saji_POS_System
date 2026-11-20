"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ConfirmationDialog({
  titleId,
  descriptionId,
  onClose,
  children,
  busy = false,
  className = "pos-dialog",
  modal = true,
}: {
  titleId: string;
  descriptionId?: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
  className?: string;
  modal?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modal) {
      element?.showModal();
    } else {
      element?.show();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    if (!modal) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      if (!modal) {
        window.removeEventListener("keydown", handleKeyDown);
      }
      element?.close();
      trigger?.focus();
    };
  }, [modal, busy, onClose]);

  return (
    <dialog
      ref={dialog}
      className={`app-dialog ${className}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

