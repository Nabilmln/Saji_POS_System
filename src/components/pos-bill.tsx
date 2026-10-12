"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/admin/client";
import { formatIdr } from "@/lib/customer/cart";
import { quoteChanged, type BillQuote } from "@/lib/staff/payment-ui";

export function BillBreakdown({ quote }: { quote: BillQuote }) {
  return <div className="pos-bill-lines">
    <div className="money-row"><span>Subtotal</span><strong>{formatIdr(quote.subtotalIdr)}</strong></div>
    {quote.discount.enabled && <div className="money-row"><span>Diskon</span><strong>−{formatIdr(quote.discount.appliedAmountIdr)}</strong></div>}
    {quote.tax.enabled && <div className="money-row"><span>Pajak ({quote.tax.rateBps / 100}% dari subtotal)</span><strong>{formatIdr(quote.tax.amountIdr)}</strong></div>}
    <div className="money-row pos-bill-total"><span>Total tagihan</span><strong>{formatIdr(quote.grandTotalIdr)}</strong></div>
  </div>;
}

export function PosBillPreview({ sessionId }: { sessionId: string }) {
  const [quote, setQuote] = useState<BillQuote | null>(null);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const current = useRef<BillQuote | null>(null);
  const refresh = useCallback(async () => {
    try {
      const next = await adminApi<BillQuote>(`/api/staff/table-sessions/${sessionId}/bill`);
      if (current.current && quoteChanged(current.current, next)) setChanged(true);
      current.current = next; setQuote(next); setError("");
    } catch { setError("Tagihan belum dapat disinkronkan. Segarkan sebelum menerima pembayaran."); }
  }, [sessionId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus); window.addEventListener("online", onFocus);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus); };
  }, [refresh]);
  return <section className="admin-panel">
    <div className="admin-section-head"><div><p className="eyebrow">TAGIHAN LANGSUNG</p><h2>Rincian tagihan</h2></div><button className="secondary-button" onClick={() => void refresh()}>Segarkan</button></div>
    {error && <div className="inline-alert" role="alert">{error}</div>}
    {changed && <div className="inline-alert info" role="status">Tagihan diperbarui. Periksa total terbaru sebelum pembayaran.</div>}
    {!quote ? <p className="muted">Memuat tagihan…</p> : <><BillBreakdown quote={quote} /><p className="muted pos-bill-meta">Revisi {quote.sessionRevision} · Pengaturan {quote.settingsVersion} · Dihitung {new Date(quote.calculatedAt).toLocaleTimeString("id-ID")}</p>
      {!quote.paymentEligible && <p className="muted">{quote.blockingOrders.length ? `${quote.blockingOrders.length} pesanan belum selesai disajikan.` : "Belum ada item yang dapat dibayar."}</p>}
      <Link className="primary-button" href={`/pos/payments/${sessionId}`}>Lihat tagihan & pembayaran</Link></>}
  </section>;
}
