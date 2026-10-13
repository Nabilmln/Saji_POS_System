"use client";

import { StatusBadge } from "@/components/ui/status-badge";

import { Alert, Button, LoadingState, Panel } from "@/components/ui/controls";

import { Brand } from "@/components/ui/brand";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/admin/client";
import { formatIdr } from "@/lib/customer/cart";

type Receipt = {
  paymentId: string; storeName: string; tableNumber: string; paidAt: string;
  orders: { customerName: string; items: { menuName: string; quantity: number; unitPriceIdr: string; lineTotalIdr: string }[] }[];
  subtotalIdr: string; discountIdr: string; tax: { rateBps: number; amountIdr: string };
  grandTotalIdr: string; cashReceivedIdr: string; changeIdr: string;
};

export function PosReceipt({ paymentId }: { paymentId: string }) {
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
  return <div className="admin-stack"><Link className="text-button" href="/pos/transactions">← Riwayat transaksi</Link>
    {error && <Alert className="inline-alert" role="alert">{error} <Button className="text-button" onClick={() => void refresh()}>Coba lagi</Button></Alert>}
    {!loaded ? <LoadingState className="loading-block" role="status">Memuat struk…</LoadingState> : receipt ? <Panel className="pos-receipt admin-panel"><div className="pos-receipt-head"><Brand compact /><p className="context-label">STRUK DIGITAL</p><h2>{receipt.storeName}</h2><StatusBadge status="PAID" /></div>
      <div className="pos-receipt-meta"><span>Transaksi {receipt.paymentId}</span><span>{new Date(receipt.paidAt).toLocaleString("id-ID")}</span><span>Meja {receipt.tableNumber}</span></div>
      {receipt.orders.map((order, index) => <div className="pos-receipt-order" key={`${order.customerName}-${index}`}><h3>{order.customerName}</h3>{order.items.map((item, itemIndex) => <div className="pos-receipt-line" key={`${item.menuName}-${itemIndex}`}><span>{item.quantity}× {item.menuName}<small>{formatIdr(item.unitPriceIdr)} / item</small></span><strong>{formatIdr(item.lineTotalIdr)}</strong></div>)}</div>)}
      <div className="pos-receipt-totals"><div className="money-row"><span>Subtotal</span><strong>{formatIdr(receipt.subtotalIdr)}</strong></div><div className="money-row"><span>Diskon</span><strong>−{formatIdr(receipt.discountIdr)}</strong></div><div className="money-row"><span>Pajak ({receipt.tax.rateBps / 100}%)</span><strong>{formatIdr(receipt.tax.amountIdr)}</strong></div><div className="money-row pos-bill-total"><span>Total</span><strong>{formatIdr(receipt.grandTotalIdr)}</strong></div><div className="money-row"><span>Tunai diterima</span><strong>{formatIdr(receipt.cashReceivedIdr)}</strong></div><div className="money-row"><span>Kembalian</span><strong>{formatIdr(receipt.changeIdr)}</strong></div></div><p className="muted pos-receipt-foot">Terima kasih. Struk ini menampilkan snapshot saat pembayaran.</p>
    </Panel> : <p className="empty-state">Struk tidak tersedia.</p>}
  </div>;
}
