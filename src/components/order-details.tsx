"use client";

import { useLocale } from "@/components/locale-provider";

import { CheckIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/controls";
import { StatusBadge } from "@/components/ui/status-badge";
import { Photo } from "@/components/ui/photo";


export type OrderItem = { id: string; menuItemId?: string | null; menuName: string; imageUrl?: string | null; unitPriceIdr?: string; quantity: number; lineTotalIdr: string; customerNote: string | null; served: boolean; voided: boolean };
export type StaffOrder = { id: string; customerName: string; source: "QR" | "MANUAL"; status: "PENDING" | "PREPARING" | "SERVED"; note: string | null; voidedAt: string | null; items: OrderItem[] };

export function OrderDetails({ orders, busy = "", onConfirm, onServe, onVoid }: { orders: StaffOrder[]; busy?: string; onConfirm?: (id: string) => void; onServe?: (id: string) => void; onVoid?: (item: OrderItem) => void }) {
  const { t, money } = useLocale();
  orders = orders.filter((order) => !order.voidedAt && order.items.some((item) => !item.voided));
  return <section className="order-details"><div className="detail-heading"><h2>{t("Pesanan sesi ini")}</h2><span className="count-label">{orders.length}</span></div>{orders.length ? orders.map((order) => <article className="pos-order" key={order.id}>
    <div className="order-heading"><div><h3>{order.customerName}</h3><p className="muted">#{order.id.slice(0, 8)} · {order.source === "QR" ? "QR" : t("Kasir")}</p></div><StatusBadge status={order.voidedAt ? "VOID" : order.status} /></div>
    {order.note && <p className="order-note">{order.note}</p>}
    {order.items.filter((item) => !item.voided).map((item) => <div className="pos-item" key={item.id}>
      <Photo src={item.imageUrl ?? null} alt={item.menuName} menuName={item.menuName} className="order-item-photo" />
      <div className="order-item-body">
      <div className="order-item-copy"><strong>{item.menuName} <span className="order-item-quantity">x{item.quantity}</span></strong><span className="order-item-price">{money(item.lineTotalIdr)}</span>{item.customerNote && <small>{t("Catatan:")}{" "}{item.customerNote}</small>}</div>
      <div className="pos-item-actions">
        {onServe ? <Button className={`secondary-button order-serve-button ${item.served ? "is-served" : ""}`} disabled={item.served || order.status === "PENDING" || Boolean(busy)} aria-pressed={item.served} aria-label={t("Tersaji: {0} x{1}", { "0": item.menuName, "1": item.quantity })} onClick={() => onServe(item.id)}>{item.served && <CheckIcon size={14} aria-hidden="true" />}{t("Tersaji")}</Button> : <span className="muted">{item.served ? t("Tersaji") : t("Belum tersaji")}</span>}
        {onVoid && <Button className="secondary-button danger-text order-remove-button" disabled={Boolean(busy)} onClick={() => onVoid(item)}>{t("Hapus")}</Button>}
      </div>
      </div>
    </div>)}
    {order.status === "PENDING" && !order.voidedAt && onConfirm && <Button className="primary-button full-width" disabled={Boolean(busy)} onClick={() => onConfirm(order.id)}>{busy === `confirm:${order.id}` ? t("Memproses…") : t("Konfirmasi")}</Button>}
  </article>) : <p className="empty-state">{t("Belum ada pesanan pada sesi ini.")}</p>}</section>;
}
