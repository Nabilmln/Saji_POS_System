"use client";

import { Button, Input } from "@/components/ui/controls";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatIdr } from "@/lib/customer/cart";

export type OrderItem = { id: string; menuName: string; quantity: number; lineTotalIdr: string; customerNote: string | null; served: boolean; voided: boolean };
export type StaffOrder = { id: string; customerName: string; source: "QR" | "MANUAL"; status: "PENDING" | "PREPARING" | "SERVED"; note: string | null; voidedAt: string | null; items: OrderItem[] };

export function OrderDetails({ orders, busy = "", onConfirm, onServe, onVoid }: { orders: StaffOrder[]; busy?: string; onConfirm?: (id: string) => void; onServe?: (id: string) => void; onVoid?: (item: OrderItem) => void }) {
  return <section className="order-details"><div className="detail-heading"><h2>Pesanan sesi ini</h2><span className="count-label">{orders.length}</span></div>{orders.length ? orders.map((order) => <article className="pos-order" key={order.id}>
    <div className="order-heading"><div><h3>{order.customerName}</h3><p className="muted">#{order.id.slice(0, 8)} · {order.source === "QR" ? "QR" : "Kasir"}</p></div><StatusBadge status={order.voidedAt ? "VOID" : order.status} /></div>
    {order.note && <p className="order-note">{order.note}</p>}
    {order.items.map((item) => <div className={`pos-item ${item.voided ? "voided" : ""}`} key={item.id}><div className="order-item-copy"><strong>{item.quantity}× {item.menuName}</strong><span>{formatIdr(item.lineTotalIdr)}</span>{item.customerNote && <small>Catatan: {item.customerNote}</small>}</div><div className="pos-item-actions">{!item.voided && order.status !== "PENDING" && onServe ? <label className="check-row"><Input type="checkbox" checked={item.served} disabled={item.served || Boolean(busy)} onChange={() => onServe(item.id)} aria-label={`Sudah disajikan: ${item.quantity} ${item.menuName}`} />Tersaji</label> : <span className="muted">{item.voided ? "Dibatalkan" : item.served ? "Tersaji" : "Belum tersaji"}</span>}{!item.voided && onVoid && <Button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => onVoid(item)}>Batalkan item</Button>}</div></div>)}
    {order.status === "PENDING" && !order.voidedAt && onConfirm && <Button className="primary-button full-width" disabled={Boolean(busy)} onClick={() => onConfirm(order.id)}>{busy === `confirm:${order.id}` ? "Memproses…" : "Konfirmasi"}</Button>}
  </article>) : <p className="empty-state">Belum ada pesanan pada sesi ini.</p>}</section>;
}
