"use client";

import { useId, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Alert, Button, Input } from "./controls";

export function ConfirmDelete({ name, description, onConfirm, onClose }: {
  name: string; description: string; onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const { t } = useLocale();
  const id = useId();
  const [step, setStep] = useState(1);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <ConfirmationDialog className="confirmation-dialog" titleId={`${id}-title`} descriptionId={`${id}-description`} onClose={onClose} busy={busy}>
    <h2 id={`${id}-title`}>{t(step === 1 ? "Tinjau penghapusan" : "Konfirmasi penghapusan")}</h2>
    <p id={`${id}-description`}>{description}</p>
    <strong className="confirmation-target">{name}</strong>
    {error && <Alert>{t(error)}</Alert>}
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (busy) return;
      if (step === 1) { setStep(2); return; }
      if (confirmation !== name) return;
      setBusy(true); setError("");
      try { await onConfirm(); onClose(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : t("Penghapusan gagal. Coba lagi.")); }
      finally { setBusy(false); }
    }}>
      {step === 2 && <label className="field-label">{t("Ketik {0} untuk mengonfirmasi.", { "0": name })}<Input autoComplete="off" spellCheck={false} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label>}
      <div className="dialog-actions"><Button type="button" className="secondary-button" autoFocus disabled={busy} onClick={onClose}>{t("Batal")}</Button><Button type="submit" className={step === 1 ? "primary-button" : "danger-button"} disabled={busy || (step === 2 && confirmation !== name)}>{busy ? t("Menghapus…") : t(step === 1 ? "Lanjutkan" : "Hapus")}</Button></div>
    </form>
  </ConfirmationDialog>;
}
