"use client";

import { useLocale } from "@/components/locale-provider";

import { Panel, Button, Alert, EmptyState, Input } from "@/components/ui/controls";

import { usePolling } from "@/lib/use-polling";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DetailPane } from "@/components/app-shells";
import { OrderDetails, type OrderItem, type StaffOrder } from "@/components/order-details";
import { OrderItemDeletion } from "@/components/order-item-deletion";
import { BillBreakdown } from "@/components/pos-bill";
import { ReceiptPreview } from "@/components/pos-receipt";

import { canSubmitPayment, cashChange, quoteChanged, type BillQuote } from "@/lib/staff/payment-ui";

type TableDetail = { session: { id: string; billRevision: string } | null; orders: StaffOrder[] };
type Payload = { idempotencyKey: string; expectedSessionRevision: string; expectedSettingsVersion: string; cashReceivedIdr: string };
type Payment = { paymentId: string; changeIdr: string; grandTotalIdr: string; cashReceivedIdr: string; paidAt: string; receiptUrl: string };

export function PosPayment({ sessionId, onClose, onViewReceipt }: { sessionId: string; onClose?: () => void; onViewReceipt?: (paymentId: string) => void }) {
  const { t, money, locale } = useLocale();
  const [quote, setQuote] = useState<BillQuote | null>(null);
  const [table, setTable] = useState<TableDetail | null>(null);
  const [cash, setCash] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [deleting, setDeleting] = useState<OrderItem | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const current = useRef<BillQuote | null>(null);
  const paymentInFlight = useRef(false);
  const pendingKey = `pos-payment:${sessionId}`;

  const refresh = useCallback(async (force = false) => {
    if ((paymentInFlight.current && !force) || payment) return;
    try {
      const nextQuote = await adminApi<BillQuote>(`/api/staff/table-sessions/${sessionId}/bill`);
      const nextTable = await adminApi<TableDetail>(`/api/staff/tables/${nextQuote.tableId}`);
      if (current.current && quoteChanged(current.current, nextQuote)) {
        setReviewed(false); setConfirming(false);
        setNotice("Tagihan diperbarui. Periksa total terbaru sebelum pembayaran.");
      }
      current.current = nextQuote; setQuote(nextQuote);
      setTable(nextTable.session?.id === sessionId && nextTable.session.billRevision === nextQuote.sessionRevision ? nextTable : null);
      setError("");
    } catch (cause) {
      setError(cause instanceof AdminApiError && cause.code === "SESSION_NOT_ACTIVE" ? "Sesi sudah ditutup. Periksa riwayat transaksi." : "Tagihan belum tersinkron. Segarkan sebelum membayar.");
      setReviewed(false); setConfirming(false);
    } finally { setLoaded(true); }
  }, [sessionId, payment]);
  usePolling(refresh);
  useEffect(() => {
    const initial = window.setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(pendingKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Payload;
          if (parsed.idempotencyKey && parsed.expectedSessionRevision && parsed.expectedSettingsVersion && parsed.cashReceivedIdr) {
            setPending(parsed); setNotice("Status pembayaran belum pasti. Ulangi dengan kunci transaksi yang sama atau periksa riwayat.");
          }
        }
      } catch { sessionStorage.removeItem(pendingKey); }
    }, 0);
    return () => window.clearTimeout(initial);
  }, [pendingKey]);

  async function sendPayment(payload: Payload) {
    if (paymentInFlight.current) return;
    paymentInFlight.current = true;
    setBusy(true); setError(""); setConfirming(false);
    try { sessionStorage.setItem(pendingKey, JSON.stringify(payload)); }
    catch {
      paymentInFlight.current = false; setBusy(false);
      setError("Penyimpanan tab tidak tersedia. Aktifkan penyimpanan browser sebelum membayar.");
      return;
    }
    setPending(payload);
    try {
      const result = await adminApi<Payment>(`/api/staff/table-sessions/${sessionId}/payments`, {
        ...jsonRequest("POST", payload), headers: { "Content-Type": "application/json", "Idempotency-Key": payload.idempotencyKey },
      });
      try { sessionStorage.removeItem(pendingKey); } catch { /* Payment is already confirmed by the server. */ }
      setPending(null); setPayment(result); setNotice("");
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "BILL_CHANGED") {
        sessionStorage.removeItem(pendingKey); setPending(null); setReviewed(false);
        await refresh(true);
        setNotice("Tagihan berubah. Periksa total terbaru dan konfirmasi ulang.");
      } else if (cause instanceof AdminApiError && ["CASH_INSUFFICIENT", "ORDERS_NOT_SERVED", "VALIDATION_ERROR"].includes(cause.code)) {
        sessionStorage.removeItem(pendingKey); setPending(null); setReviewed(false);
        await refresh(true);
        setError("Pembayaran ditolak. Segarkan tagihan dan periksa uang serta status pesanan.");
      } else if (cause instanceof AdminApiError && ["PAYMENT_ALREADY_RECORDED", "SESSION_NOT_ACTIVE"].includes(cause.code)) {
        sessionStorage.removeItem(pendingKey); setPending(null);
        setError("Sesi ini sudah ditutup. Periksa riwayat transaksi sebelum melakukan pembayaran lain.");
      } else {
        setError("Hasil pembayaran belum pasti. Jangan membuat pembayaran baru; ulangi transaksi ini atau periksa riwayat.");
      }
    } finally { paymentInFlight.current = false; setBusy(false); }
  }
  const change = cashChange(quote, cash);
  async function updateOrder(path: string, method: "POST" | "PATCH", body: object) {
    if (busy || pending || paymentInFlight.current) return;
    setBusy(true); setReviewed(false); setConfirming(false); setError("");
    try { await adminApi(path, jsonRequest(method, body)); await refresh(true); }
    catch { await refresh(true); setError("Perubahan gagal. Segarkan data dan coba lagi."); }
    finally { setBusy(false); }
  }
  const ready = canSubmitPayment(quote, cash, reviewed) && !pending && !busy && !error && !!table;
  if (payment) return <div className="admin-stack"><Panel className="admin-panel success-panel" role="status"><p className="context-label">{t("LUNAS")}</p><h2>{t("Pembayaran berhasil")}</h2><p>{t("Total")}{" "}{money(payment.grandTotalIdr)} {" "}{t("· Tunai")}{" "}{money(payment.cashReceivedIdr)} {" "}{t("· Kembalian")}{" "}{money(payment.changeIdr)}</p><p className="muted">{t("Meja kembali tersedia setelah pembayaran dikonfirmasi server.")}</p><div className="admin-actions">{onViewReceipt ? <Button onClick={() => onViewReceipt(payment.paymentId)}>{t("Lihat struk digital")}</Button> : <Link className="primary-button" href={payment.receiptUrl}>{t("Lihat struk digital")}</Link>}{onClose ? <Button className="secondary-button" onClick={onClose}>{t("Kembali ke meja")}</Button> : <Link className="secondary-button" href="/pos">{t("Kembali ke meja")}</Link>}</div></Panel>{receiptOpen && <DetailPane><ReceiptPreview key={payment.paymentId} paymentId={payment.paymentId} onClose={() => setReceiptOpen(false)} /></DetailPane>}</div>;
  return <div className="admin-stack">
    {onClose ? <Button className="text-button" disabled={busy} onClick={onClose}>{t("← Kembali ke meja")}</Button> : <Link className="text-button" href={quote ? `/pos/tables/${quote.tableId}` : "/pos"}>{t("← Kembali ke meja")}</Link>}
    <Panel className="admin-panel"><div className="admin-section-head"><div><h2>{quote ? t("Meja {0}", { "0": quote.tableNumber }) : t("Tagihan sesi")}</h2></div><Button className="secondary-button" disabled={busy} onClick={() => void refresh()}>{t("Segarkan")}</Button></div>
      {notice && <Alert toast className="inline-alert info" role="status">{t(notice)}</Alert>}{error && <Alert className="inline-alert" role="alert">{t(error)} {pending && <Link href="/pos/transactions">{t("Periksa riwayat")}</Link>}</Alert>}
      {!loaded ? <p className="loading-block" role="status">{t("Memuat tagihan…")}</p> : !quote ? <EmptyState className="empty-state"><p>{t("Tagihan tidak tersedia.")}</p>{pending && <Button className="primary-button" disabled={busy} onClick={() => void sendPayment(pending)}>{busy ? t("Memeriksa pembayaran…") : t("Ulangi transaksi yang sama")}</Button>} <Link href="/pos/transactions">{t("Lihat riwayat transaksi")}</Link></EmptyState> : <>
        <p className="muted">{t("Sesi")}{" "}{sessionId.slice(0, 8)} {" "}{t("· Revisi")}{" "}{quote.sessionRevision} {" "}{t("· Pengaturan")}{" "}{quote.settingsVersion} {" "}{t("· Dihitung")}{" "}{new Date(quote.calculatedAt).toLocaleTimeString(locale === "en" ? "en-GB" : "id-ID", { timeZone: "Asia/Jakarta" })}</p>

        {receiptOpen ? <DetailPane><ReceiptPreview key={sessionId} sessionId={sessionId} onClose={() => setReceiptOpen(false)} /></DetailPane> : table ? <DetailPane footer={<Button type="button" className="secondary-button full-width" disabled={busy || Boolean(pending)} onClick={() => setReceiptOpen(true)}>{t("Lihat struk")}</Button>}><OrderDetails orders={table.orders} busy={busy || !!pending ? "payment" : ""} onConfirm={(id) => void updateOrder(`/api/staff/orders/${id}/confirm`, "POST", {})} onServe={(id) => void updateOrder(`/api/staff/order-items/${id}/served`, "PATCH", { served: true })} onVoid={setDeleting} /><section className="detail-bill"><h2>{t("Rincian tagihan")}</h2><BillBreakdown quote={quote} /></section></DetailPane> : <p className="muted">{t("Rincian pesanan sedang disinkronkan. Segarkan sebelum membayar.")}</p>}
        {!quote.paymentEligible && <Alert className="inline-alert info">{quote.blockingOrders.length ? t("{0} pesanan belum tersaji seluruhnya. Gunakan tombol Tersaji di panel rincian.", { "0": quote.blockingOrders.length }) : t("Belum ada item aktif untuk dibayar.")}</Alert>}
        <fieldset className="payment-entry"><legend>{t("Pembayaran tunai")}</legend><label className="field-label" htmlFor="cash-received">{t("Uang diterima (Rp)")}</label><Input className="text-field" id="cash-received" inputMode="numeric" autoComplete="off" value={cash} disabled={Boolean(pending) || busy} maxLength={16} onChange={(event) => { setCash(event.target.value.replace(/\D/g, "")); setConfirming(false); }} placeholder={t("Contoh: 200000")} />
        <p className="muted">{t("Kembalian:")}{" "}<strong>{money(change ?? 0n)}</strong>{cash && change === null ? t(" · Uang diterima belum cukup atau tidak valid.") : ""}</p>
        <label className="check-row"><Input type="checkbox" checked={reviewed} disabled={Boolean(pending) || busy || !quote.paymentEligible || !table || Boolean(error)} onChange={(event) => setReviewed(event.target.checked)} />{t("Saya sudah memeriksa tagihan terbaru dan uang diterima")}</label>
        <div className="admin-actions">{pending ? <Button className="primary-button" disabled={busy} onClick={() => void sendPayment(pending)}>{busy ? t("Memeriksa pembayaran…") : t("Ulangi transaksi yang sama")}</Button> : <Button className="primary-button" disabled={!ready} onClick={() => setConfirming(true)}>{t("Konfirmasi pembayaran")}</Button>}</div>
        </fieldset>
      </>}
    </Panel>
    {deleting && <OrderItemDeletion key={deleting.id} item={deleting} onClose={() => setDeleting(null)} onDeleted={async () => { setReviewed(false); setConfirming(false); await refresh(true); }} />}
    {confirming && quote && <ConfirmationDialog titleId="payment-confirm-title" onClose={() => setConfirming(false)}><h2 id="payment-confirm-title">{t("Konfirmasi pembayaran tunai")}</h2><p>{t("Meja")}{" "}{quote.tableNumber} {" "}{t("· Tagihan")}{" "}<strong>{money(quote.grandTotalIdr)}</strong></p><p>{t("Uang diterima")}{" "}{money(cash)} {" "}{t("· Kembalian")}{" "}{money(change ?? 0n)}</p><p className="muted">{t("Pembayaran akan menutup sesi dan mengembalikan meja ke status Tersedia.")}</p><div className="admin-actions"><Button className="secondary-button" onClick={() => setConfirming(false)}>{t("Periksa lagi")}</Button><Button className="primary-button" disabled={!ready} onClick={() => void sendPayment({ idempotencyKey: crypto.randomUUID(), expectedSessionRevision: quote.sessionRevision, expectedSettingsVersion: quote.settingsVersion, cashReceivedIdr: cash })}>{t("Bayar tunai")}</Button></div></ConfirmationDialog>}
  </div>;
}
