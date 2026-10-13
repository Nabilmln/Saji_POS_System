"use client";

import { useLocale } from "@/components/locale-provider";

import { Button, Input } from "@/components/ui/controls";
import { StatusBadge } from "@/components/ui/status-badge";
import { sessionItems } from "@/lib/staff/session-items";


export type OrderItem = { id: string; menuItemId?: string | null; menuName: string; unitPriceIdr?: string; quantity: number; lineTotalIdr: string; customerNote: string | null; served: boolean; voided: boolean };
export type StaffOrder = { id: string; customerName: string; source: "QR" | "MANUAL"; status: "PENDING" | "PREPARING" | "SERVED"; note: string | null; voidedAt: string | null; items: OrderItem[] };

export function OrderDetails({ orders, busy = "", onConfirm, onServe, onVoid }: { orders: StaffOrder[]; busy?: string; onConfirm?: (id: string) => void; onServe?: (id: string) => void; onVoid?: (item: OrderItem) => void }) {
  const { t, money } = useLocale();
  const tally = sessionItems(orders);
  return <section className="order-details"><div className="detail-heading"><h2>{t("Pesanan sesi ini")}</h2><span className="count-label">{orders.length}</span></div>{tally.length > 0 && <details className="session-tally" open><summary>{t("Ringkasan menu sesi")}</summary>{tally.map((item, index) => <div className="money-row" key={index}><span>{item.quantity}× {item.menuName}</span><strong>{money(item.lineTotalIdr)}</strong></div>)}<div className="money-row"><span>{t("Subtotal menu")}</span><strong>{money(tally.reduce((sum, item) => sum + BigInt(item.lineTotalIdr), 0n))}</strong></div></details>}{orders.length ? orders.map((order) => <article className="pos-order" key={order.id}>
    <div className="order-heading"><div><h3>{order.customerName}</h3><p className="muted">#{order.id.slice(0, 8)} · {order.source === "QR" ? "QR" : t("Kasir")}</p></div><StatusBadge status={order.voidedAt ? "VOID" : order.status} /></div>
    {order.note && <p className="order-note">{order.note}</p>}
    {order.items.map((item) => <div className={`pos-item ${item.voided ? "voided" : ""}`} key={item.id}><div className="order-item-copy"><strong>{item.quantity}× {item.menuName}</strong><span>{money(item.lineTotalIdr)}</span>{item.customerNote && <small>{t("Catatan:")}{" "}{item.customerNote}</small>}</div><div className="pos-item-actions">{!item.voided && order.status !== "PENDING" && onServe ? <label className="check-row"><Input type="checkbox" checked={item.served} disabled={item.served || Boolean(busy)} onChange={() => onServe(item.id)} aria-label={t("Sudah disajikan: {0} {1}", { "0": item.quantity, "1": item.menuName })} />{t("Tersaji")}</label> : <span className="muted">{item.voided ? t("Dibatalkan") : item.served ? t("Tersaji") : t("Belum tersaji")}</span>}{!item.voided && onVoid && <Button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => onVoid(item)}>{t("Batalkan item")}</Button>}</div></div>)}
    {order.status === "PENDING" && !order.voidedAt && onConfirm && <Button className="primary-button full-width" disabled={Boolean(busy)} onClick={() => onConfirm(order.id)}>{busy === `confirm:${order.id}` ? t("Memproses…") : t("Konfirmasi")}</Button>}
  </article>) : <p className="empty-state">{t("Belum ada pesanan pada sesi ini.")}</p>}</section>;
}
