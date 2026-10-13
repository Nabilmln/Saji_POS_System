"use client";

import { useState, type FormEvent } from "react";
import { useLocale } from "@/components/locale-provider";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Alert, Button, Selection, Textarea } from "@/components/ui/controls";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import type { OrderItem } from "@/components/order-details";

export function OrderItemDeletion({ item, onClose, onDeleted }: { item: OrderItem; onClose: () => void; onDeleted: () => Promise<void> }) {
  const { t } = useLocale();
  const [served, setServed] = useState(item.served);
  const [reasonType, setReasonType] = useState("CUSTOMER_REQUEST");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      await adminApi(`/api/staff/order-items/${item.id}/void`, jsonRequest("POST", served ? { reasonType, reasonDetail: reason.trim() } : {}));
      await onDeleted(); onClose();
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "VOID_REASON_REQUIRED") {
        setServed(true); setError("Item sudah tersaji. Isi alasan penghapusan sebelum melanjutkan.");
      } else setError("Perubahan gagal. Segarkan data dan coba lagi.");
    } finally { setBusy(false); }
  }
  return <ConfirmationDialog titleId="delete-item-title" busy={busy} onClose={onClose}>
    <h2 id="delete-item-title">{t("Hapus item?")}</h2><p>{item.quantity}× {item.menuName}{t(". Tagihan akan dihitung ulang.")}</p>
    {error && <Alert>{t(error)}</Alert>}
    <form onSubmit={(event) => void submit(event)}>
      {served ? <><p className="muted">{t("Item sudah tersaji. Alasan retur atau pembatalan wajib diisi.")}</p><Selection label={t("Alasan")} value={reasonType} onChange={setReasonType} options={[{ value: "CUSTOMER_REQUEST", label: t("Permintaan pelanggan") }, { value: "EMPLOYEE_ERROR", label: t("Kesalahan pegawai") }]} /><label className="field-label">{t("Penjelasan")}<Textarea className="text-field" required minLength={5} maxLength={500} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} /></label></> : <p className="muted">{t("Item belum tersaji. Alasan tidak diperlukan.")}</p>}
      <div className="admin-actions"><Button type="button" className="secondary-button" disabled={busy} onClick={onClose}>{t("Kembali")}</Button><Button disabled={busy}>{t("Hapus")}</Button></div>
    </form>
  </ConfirmationDialog>;
}
