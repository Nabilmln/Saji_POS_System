"use client";

import { useLocale } from "@/components/locale-provider";
import { formatDateTime } from "@/lib/time";

import { StatusBadge } from "@/components/ui/status-badge";

import { Alert, Button, LoadingState, Panel } from "@/components/ui/controls";

import { Brand } from "@/components/ui/brand";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/admin/client";


type Receipt = {
  paymentId: string; storeName: string; tableNumber: string; paidAt: string;
  orders: { customerName: string; items: { menuName: string; quantity: number; unitPriceIdr: string; lineTotalIdr: string }[] }[];
  subtotalIdr: string; discountIdr: string; tax: { rateBps: number; amountIdr: string };
  grandTotalIdr: string; cashReceivedIdr: string; changeIdr: string;
};

export function PosReceipt({ paymentId }: { paymentId: string }) {
  const { t, locale, money } = useLocale();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try { setReceipt(await adminApi<Receipt>(`/api/staff/payments/${paymentId}/receipt`)); setError(""); }
    catch { setError("Struk tidak dapat dimuat. Periksa koneksi atau nomor transaksi."); }
    finally { setLoaded(true); }
  }, [paymentId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);
  return <div className="admin-stack"><Link className="text-button" href="/pos/transactions">{t("← Riwayat transaksi")}</Link>
    {error && <Alert className="inline-alert" role="alert">{t(error)} <Button className="text-button" onClick={() => void refresh()}>{t("Coba lagi")}</Button></Alert>}
    {!loaded ? <LoadingState className="loading-block" role="status">{t("Memuat struk…")}</LoadingState> : receipt ? <Panel className="pos-receipt admin-panel"><div className="pos-receipt-head"><Brand compact /><p className="context-label">{t("STRUK DIGITAL")}</p><h2>{receipt.storeName}</h2><StatusBadge status="PAID" /></div>
      <div className="pos-receipt-meta"><span>{t("Transaksi")}{" "}{receipt.paymentId}</span><span>{formatDateTime(receipt.paidAt, locale)}</span><span>{t("Meja")}{" "}{receipt.tableNumber}</span></div>
      {receipt.orders.map((order, index) => <div className="pos-receipt-order" key={`${order.customerName}-${index}`}><h3>{order.customerName}</h3>{order.items.map((item, itemIndex) => <div className="pos-receipt-line" key={`${item.menuName}-${itemIndex}`}><span>{item.quantity}× {item.menuName}<small>{money(item.unitPriceIdr)} {" "}{t("/ item")}</small></span><strong>{money(item.lineTotalIdr)}</strong></div>)}</div>)}
      <div className="pos-receipt-totals"><div className="money-row"><span>{t("Subtotal")}</span><strong>{money(receipt.subtotalIdr)}</strong></div><div className="money-row"><span>{t("Diskon")}</span><strong>−{money(receipt.discountIdr)}</strong></div><div className="money-row"><span>{t("Pajak (")}{receipt.tax.rateBps / 100}%)</span><strong>{money(receipt.tax.amountIdr)}</strong></div><div className="money-row pos-bill-total"><span>{t("Total")}</span><strong>{money(receipt.grandTotalIdr)}</strong></div><div className="money-row"><span>{t("Tunai diterima")}</span><strong>{money(receipt.cashReceivedIdr)}</strong></div><div className="money-row"><span>{t("Kembalian")}</span><strong>{money(receipt.changeIdr)}</strong></div></div><p className="muted pos-receipt-foot">{t("Terima kasih. Struk ini menampilkan snapshot saat pembayaran.")}</p>
    </Panel> : <p className="empty-state">{t("Struk tidak tersedia.")}</p>}
  </div>;
}
