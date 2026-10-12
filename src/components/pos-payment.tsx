"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { BillBreakdown } from "@/components/pos-bill";
import { formatIdr } from "@/lib/customer/cart";
import { canSubmitPayment, cashChange, quoteChanged, type BillQuote } from "@/lib/staff/payment-ui";

type TableDetail = { session: { id: string; billRevision: string } | null; orders: { id: string; customerName: string; voidedAt: string | null; items: { id: string; menuName: string; quantity: number; lineTotalIdr: string; voided: boolean }[] }[] };
type Payload = { idempotencyKey: string; expectedSessionRevision: string; expectedSettingsVersion: string; cashReceivedIdr: string };
type Payment = { paymentId: string; changeIdr: string; grandTotalIdr: string; cashReceivedIdr: string; paidAt: string; receiptUrl: string };

export function PosPayment({ sessionId }: { sessionId: string }) {
  const [quote, setQuote] = useState<BillQuote | null>(null);
  const [table, setTable] = useState<TableDetail | null>(null);
  const [cash, setCash] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
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
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus); window.addEventListener("online", onFocus);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus); };
  }, [refresh]);
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
        setNotice("Tagihan berubah. Periksa total terbaru dan konfirmasi ulang.");
        await refresh(true);
      } else if (cause instanceof AdminApiError && ["CASH_INSUFFICIENT", "ORDERS_NOT_SERVED", "VALIDATION_ERROR"].includes(cause.code)) {
        sessionStorage.removeItem(pendingKey); setPending(null); setReviewed(false);
        setError("Pembayaran ditolak. Segarkan tagihan dan periksa uang serta status pesanan.");
        await refresh(true);
      } else if (cause instanceof AdminApiError && ["PAYMENT_ALREADY_RECORDED", "SESSION_NOT_ACTIVE"].includes(cause.code)) {
        sessionStorage.removeItem(pendingKey); setPending(null);
        setError("Sesi ini sudah ditutup. Periksa riwayat transaksi sebelum melakukan pembayaran lain.");
      } else {
        setError("Hasil pembayaran belum pasti. Jangan membuat pembayaran baru; ulangi transaksi ini atau periksa riwayat.");
      }
    } finally { paymentInFlight.current = false; setBusy(false); }
  }
  const change = cashChange(quote, cash);
  const ready = canSubmitPayment(quote, cash, reviewed) && !pending && !busy && !error && !!table;
  if (payment) return <div className="admin-stack"><section className="admin-panel success-panel" role="status"><p className="eyebrow">LUNAS</p><h2>Pembayaran berhasil</h2><p>Total {formatIdr(payment.grandTotalIdr)} · Tunai {formatIdr(payment.cashReceivedIdr)} · Kembalian {formatIdr(payment.changeIdr)}</p><p className="muted">Meja kembali tersedia setelah pembayaran dikonfirmasi server.</p><div className="admin-actions"><Link className="primary-button" href={payment.receiptUrl}>Lihat struk digital</Link><Link className="secondary-button" href="/pos">Kembali ke meja</Link></div></section></div>;
  return <div className="admin-stack">
    <Link className="text-button" href={quote ? `/pos/tables/${quote.tableId}` : "/pos"}>← Kembali ke meja</Link>
    <section className="admin-panel"><div className="admin-section-head"><div><p className="eyebrow">PEMBAYARAN TUNAI</p><h2>{quote ? `Meja ${quote.tableNumber}` : "Tagihan sesi"}</h2></div><button className="secondary-button" disabled={busy} onClick={() => void refresh()}>Segarkan</button></div>
      {notice && <div className="inline-alert info" role="status">{notice}</div>}{error && <div className="inline-alert" role="alert">{error} {pending && <Link href="/pos/transactions">Periksa riwayat</Link>}</div>}
      {!loaded ? <p className="loading-block" role="status">Memuat tagihan…</p> : !quote ? <div className="empty-state"><p>Tagihan tidak tersedia.</p>{pending && <button className="primary-button" disabled={busy} onClick={() => void sendPayment(pending)}>{busy ? "Memeriksa pembayaran…" : "Ulangi transaksi yang sama"}</button>} <Link href="/pos/transactions">Lihat riwayat transaksi</Link></div> : <>
        <p className="muted">Sesi {sessionId.slice(0, 8)} · Revisi {quote.sessionRevision} · Pengaturan {quote.settingsVersion} · Dihitung {new Date(quote.calculatedAt).toLocaleTimeString("id-ID")}</p>
        {table ? <div className="pos-payment-orders"><h3>Rincian pesanan</h3>{table.orders.filter((order) => order.items.some((item) => !item.voided)).map((order) => <div className="pos-payment-order" key={order.id}><strong>{order.customerName}</strong>{order.items.filter((item) => !item.voided).map((item) => <div className="money-row" key={item.id}><span>{item.quantity}× {item.menuName}</span><strong>{formatIdr(item.lineTotalIdr)}</strong></div>)}</div>)}</div> : <p className="muted">Rincian pesanan sedang disinkronkan. Segarkan sebelum membayar.</p>}
        <BillBreakdown quote={quote} />
        {!quote.paymentEligible && <div className="inline-alert info">{quote.blockingOrders.length ? `${quote.blockingOrders.length} pesanan belum tersaji seluruhnya. Selesaikan checklist di detail meja.` : "Belum ada item aktif untuk dibayar."}</div>}
        <label className="field-label" htmlFor="cash-received">Uang diterima (Rp)</label><input className="text-field" id="cash-received" inputMode="numeric" autoComplete="off" value={cash} disabled={Boolean(pending) || busy} maxLength={16} onChange={(event) => { setCash(event.target.value.replace(/\D/g, "")); setConfirming(false); }} placeholder="Contoh: 200000" />
        <p className="muted">Kembalian: <strong>{formatIdr(change ?? 0n)}</strong>{cash && change === null ? " · Uang diterima belum cukup atau tidak valid." : ""}</p>
        <label className="check-row"><input type="checkbox" checked={reviewed} disabled={Boolean(pending) || busy || !quote.paymentEligible || !table || Boolean(error)} onChange={(event) => setReviewed(event.target.checked)} />Saya sudah memeriksa tagihan terbaru dan uang diterima</label>
        <div className="admin-actions">{pending ? <button className="primary-button" disabled={busy} onClick={() => void sendPayment(pending)}>{busy ? "Memeriksa pembayaran…" : "Ulangi transaksi yang sama"}</button> : <button className="primary-button" disabled={!ready} onClick={() => setConfirming(true)}>Konfirmasi pembayaran</button>}</div>
      </>}
    </section>
    {confirming && quote && <div className="pos-dialog-backdrop"><section className="pos-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-confirm-title"><h2 id="payment-confirm-title">Konfirmasi pembayaran tunai</h2><p>Meja {quote.tableNumber} · Tagihan <strong>{formatIdr(quote.grandTotalIdr)}</strong></p><p>Uang diterima {formatIdr(cash)} · Kembalian {formatIdr(change ?? 0n)}</p><p className="muted">Pembayaran akan menutup sesi dan mengembalikan meja ke status Tersedia.</p><div className="admin-actions"><button className="secondary-button" onClick={() => setConfirming(false)}>Periksa lagi</button><button className="primary-button" disabled={!ready} onClick={() => void sendPayment({ idempotencyKey: crypto.randomUUID(), expectedSessionRevision: quote.sessionRevision, expectedSettingsVersion: quote.settingsVersion, cashReceivedIdr: cash })}>Bayar tunai</button></div></section></div>}
  </div>;
}
