"use client";

import { useLocale } from "@/components/locale-provider";

import { Panel, Button, Alert } from "@/components/ui/controls";

import { usePolling } from "@/lib/use-polling";

import { useCallback, useRef, useState } from "react";
import { adminApi } from "@/lib/admin/client";

import { quoteChanged, type BillQuote } from "@/lib/staff/payment-ui";

export function BillBreakdown({ quote }: { quote: BillQuote }) {
  const { t, money } = useLocale();
  return <div className="pos-bill-lines">
    <div className="money-row"><span>{t("Subtotal")}</span><strong>{money(quote.subtotalIdr)}</strong></div>
    {quote.discount.enabled && <div className="money-row"><span>{t("Diskon")}</span><strong>−{money(quote.discount.appliedAmountIdr)}</strong></div>}
    {quote.tax.enabled && <div className="money-row"><span>{t("Pajak (")}{quote.tax.rateBps / 100}{t("% dari subtotal)")}</span><strong>{money(quote.tax.amountIdr)}</strong></div>}
    <div className="money-row pos-bill-total"><span>{t("Total tagihan")}</span><strong>{money(quote.grandTotalIdr)}</strong></div>
  </div>;
}

export function PosBillPreview({ sessionId }: { sessionId: string }) {
  const { t, locale } = useLocale();
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
  usePolling(refresh);
  return <Panel className="admin-panel">
    <div className="admin-section-head"><div><h2>{t("Rincian tagihan")}</h2></div><Button className="secondary-button" onClick={() => void refresh()}>{t("Segarkan")}</Button></div>
    {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
    {changed && <Alert className="inline-alert info" role="status">{t("Tagihan diperbarui. Periksa total terbaru sebelum pembayaran.")}</Alert>}
    {!quote ? <p className="muted">{t("Memuat tagihan…")}</p> : <><BillBreakdown quote={quote} /><p className="muted pos-bill-meta">{t("Revisi")}{" "}{quote.sessionRevision} {" "}{t("· Pengaturan")}{" "}{quote.settingsVersion} {" "}{t("· Dihitung")}{" "}{new Date(quote.calculatedAt).toLocaleTimeString(locale === "en" ? "en-GB" : "id-ID", { timeZone: "Asia/Jakarta" })}</p>
      {!quote.paymentEligible && <p className="muted">{quote.blockingOrders.length ? t("{0} pesanan belum selesai disajikan.", { "0": quote.blockingOrders.length }) : t("Belum ada item yang dapat dibayar.")}</p>}
      </>}
  </Panel>;
}
