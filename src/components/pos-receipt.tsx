"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { EntranceMotion } from "@/components/ui/entrance-motion";
import { flushSync } from "react-dom";
import { PrinterIcon } from "@phosphor-icons/react";
import { useLocale } from "@/components/locale-provider";
import { formatDateTime } from "@/lib/time";
import { adminApi } from "@/lib/admin/client";
import { Alert, Button, LoadingState, Panel } from "@/components/ui/controls";
import { Brand } from "@/components/ui/brand";
import { StatusBadge } from "@/components/ui/status-badge";

type Receipt = {
  storeName: string; tableNumber: string;
  orders: { customerName: string; items: { menuName: string; quantity: number; unitPriceIdr: string; lineTotalIdr: string }[] }[];
  subtotalIdr: string; discountIdr: string; tax: { rateBps: number; amountIdr: string }; grandTotalIdr: string;
} & (
  { paymentId: string; paidAt: string; cashReceivedIdr: string; changeIdr: string } |
  { paymentId: null; paidAt: null; cashReceivedIdr: null; changeIdr: null; sessionId: string; calculatedAt: string }
);

export function ReceiptPreview({ paymentId, sessionId, onClose }: {
  onClose: () => void;
} & ({ paymentId: string; sessionId?: never } | { sessionId: string; paymentId?: never })) {
  const { t, locale, money } = useLocale();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const content = useRef<HTMLElement>(null);
  const controller = useRef<AbortController | null>(null);
  const endpoint = paymentId ? `/api/staff/payments/${paymentId}/receipt` : `/api/staff/table-sessions/${sessionId}/receipt`;
  const refresh = useCallback(async (print = false) => {
    const signal = controller.current?.signal;
    setBusy(true);
    try {
      const data = await adminApi<Receipt>(endpoint, { signal });
      if (signal?.aborted) return;
      if (print) {
        // Commit the fresh receipt before the browser captures the print document.
        flushSync(() => { setReceipt(data); setError(""); });
        window.print();
      } else { setReceipt(data); setError(""); }
    } catch {
      if (!signal?.aborted) { setReceipt(null); setError("Struk tidak dapat dimuat. Periksa koneksi atau nomor transaksi."); }
    } finally { if (!signal?.aborted) setBusy(false); }
  }, [endpoint]);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [refresh]);
  return <section ref={content} className="receipt-preview" aria-label={t("Pratinjau struk")}>
    <div className="detail-heading"><h2>{t("Pratinjau struk")}</h2><Button type="button" className="text-button" onClick={onClose}>{t("Tutup")}</Button></div>
    <div className="receipt-toolbar"><Button type="button" className="secondary-button" disabled={busy} onClick={() => void refresh()}>{t("Segarkan")}</Button><Button type="button" disabled={busy || !receipt || !!error} onClick={() => void refresh(true)}><PrinterIcon size={17} aria-hidden="true" />{t("Cetak struk")}</Button></div>
    {error && <Alert>{t(error)}</Alert>}
    {busy && !receipt ? <LoadingState>{t("Memuat struk…")}</LoadingState> : receipt && <Panel className="pos-receipt">
      <div className="pos-receipt-head"><Brand compact /><h2>{receipt.storeName}</h2><StatusBadge status={receipt.paymentId === null ? "UNPAID" : "PAID"}>{t(receipt.paymentId === null ? "Belum lunas" : "Lunas")}</StatusBadge></div>
      <div className="pos-receipt-meta"><span>{t(receipt.paymentId === null ? "Sesi" : "Transaksi")}{" "}{receipt.paymentId === null ? receipt.sessionId : receipt.paymentId}</span><span>{receipt.paymentId === null && `${t("Dihitung")} `}{formatDateTime(receipt.paymentId === null ? receipt.calculatedAt : receipt.paidAt, locale)}</span><span>{t("Meja")}{" "}{receipt.tableNumber}</span></div>
      {receipt.paymentId === null && <p className="receipt-unpaid-note">{t("Belum dibayar. Total dapat berubah jika ada tambahan pesanan, pembatalan item, atau perubahan diskon dan pajak.")}</p>}
      {receipt.orders.length ? receipt.orders.map((order, index) => <div className="pos-receipt-order" key={`${order.customerName}-${index}`}><h3>{order.customerName}</h3>{order.items.map((item, itemIndex) => <div className="pos-receipt-line" key={`${item.menuName}-${itemIndex}`}><span>{item.quantity}× {item.menuName}<small>{money(item.unitPriceIdr)} {t("/ item")}</small></span><strong>{money(item.lineTotalIdr)}</strong></div>)}</div>) : <p className="muted">{t("Belum ada item aktif untuk dibayar.")}</p>}
      <div className="pos-receipt-totals"><div className="money-row"><span>{t("Subtotal")}</span><strong>{money(receipt.subtotalIdr)}</strong></div><div className="money-row"><span>{t("Diskon")}</span><strong>−{money(receipt.discountIdr)}</strong></div><div className="money-row"><span>{t("Pajak (")}{receipt.tax.rateBps / 100}%)</span><strong>{money(receipt.tax.amountIdr)}</strong></div><div className="money-row pos-bill-total"><span>{t("Total")}</span><strong>{money(receipt.grandTotalIdr)}</strong></div>
        {receipt.paymentId !== null && <><div className="money-row"><span>{t("Tunai diterima")}</span><strong>{money(receipt.cashReceivedIdr)}</strong></div><div className="money-row"><span>{t("Kembalian")}</span><strong>{money(receipt.changeIdr)}</strong></div></>}
      </div><p className="muted pos-receipt-foot">{t(receipt.paymentId === null ? "Cetakan ini menunjukkan tagihan belum lunas." : "Terima kasih. Pembayaran telah dikonfirmasi.")}</p>
    </Panel>}
    <Suspense fallback={null}><EntranceMotion target={content} variant="content" revision={JSON.stringify(receipt && { ...receipt, calculatedAt: undefined })} /></Suspense>
  </section>;
}
