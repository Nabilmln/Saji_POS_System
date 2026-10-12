"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, jsonRequest } from "@/lib/admin/client";
import { formatIdr } from "@/lib/customer/cart";

type Table = { id: string; tableNumber: string; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; activeOrderCount: number; pendingOrderCount: number; grandTotalIdr: string };
type Order = { id: string; tableId: string; tableNumber: string; customerName: string; source: "QR" | "MANUAL"; status: "PENDING" | "PREPARING" | "SERVED"; itemCount: number; createdAt: string };
const tableLabels = { AVAILABLE: "Tersedia", OCCUPIED: "Terisi", RESERVED: "Dipesan" };
const orderLabels = { PENDING: "Menunggu", PREPARING: "Disiapkan", SERVED: "Tersaji" };

export function PosOverview() {
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState<Order["status"] | "ALL">("PENDING");
  const [orderTable, setOrderTable] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [nextTables, ...orderGroups] = await Promise.all([
        adminApi<Table[]>("/api/staff/tables"),
        ...(orderStatus === "ALL" ? (["PENDING", "PREPARING", "SERVED"] as const) : [orderStatus])
          .map((status) => adminApi<Order[]>(`/api/staff/orders?status=${status}&pageSize=100`)),
      ]);
      setTables(nextTables); setOrders(orderGroups.flat().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))); setError(""); setSyncedAt(new Date());
    } catch { setError("Data belum tersinkron. Periksa koneksi lalu coba lagi."); }
    finally { setLoaded(true); }
  }, [orderStatus]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", onFocus); window.removeEventListener("online", onFocus); };
  }, [refresh]);
  const visible = tables.filter((table) => (filter === "ALL" || table.status === filter) && table.tableNumber.toLowerCase().includes(query.trim().toLowerCase()));
  const visibleOrders = orders.filter((order) => (!orderTable || order.tableId === orderTable) && (!orderDate || new Date(order.createdAt).toLocaleDateString("sv-SE") === orderDate));
  async function confirm(order: Order) {
    setBusy(order.id); setError("");
    try { await adminApi(`/api/staff/orders/${order.id}/confirm`, jsonRequest("POST", {})); await refresh(); }
    catch { await refresh(); setError("Pesanan gagal dikonfirmasi. Muat ulang untuk melihat status terbaru."); }
    finally { setBusy(""); }
  }
  return <div className="admin-stack">
    <section className="admin-panel">
      <div className="admin-section-head"><div><p className="eyebrow">OPERASIONAL</p><h2>Ringkasan meja</h2></div><button className="secondary-button" onClick={() => void refresh()}>Segarkan</button></div>
      <p className="muted">{syncedAt ? `Terakhir sinkron ${syncedAt.toLocaleTimeString("id-ID")}` : "Menunggu data…"} · Diperbarui otomatis setiap 5 detik saat tab aktif.</p>
      {error && <div className="inline-alert" role="alert">{error}</div>}
      <div className="admin-filters">
        <label>Cari meja<input className="text-field" value={query} maxLength={30} onChange={(event) => setQuery(event.target.value)} placeholder="Nomor meja" /></label>
        <label>Status<select className="text-field" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">Semua</option>{Object.entries(tableLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {!loaded ? <div className="loading-block" role="status">Memuat meja…</div> : visible.length ? <div className="pos-table-grid">{visible.map((table) => <Link className="pos-table-card" href={`/pos/tables/${table.id}`} key={table.id}>
        <span className={`status-chip ${table.status.toLowerCase()}`}>{tableLabels[table.status]}</span><h3>Meja {table.tableNumber}</h3>
        <p>{table.pendingOrderCount} menunggu · {table.activeOrderCount} pesanan aktif</p><strong>{formatIdr(table.grandTotalIdr)}</strong><span className="pos-card-link">Lihat meja →</span>
      </Link>)}</div> : <p className="empty-state">Tidak ada meja yang cocok.</p>}
    </section>
    <section className="admin-panel">
      <div className="admin-section-head"><div><p className="eyebrow">PESANAN MASUK</p><h2>Inbox {visibleOrders.length > 0 && <small className="muted">({visibleOrders.length})</small>}</h2></div></div>
      <div className="admin-filters"><label>Status<select className="text-field" value={orderStatus} onChange={(event) => setOrderStatus(event.target.value as Order["status"] | "ALL")}><option value="ALL">Semua</option>{Object.entries(orderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Meja<select className="text-field" value={orderTable} onChange={(event) => setOrderTable(event.target.value)}><option value="">Semua meja</option>{tables.map((table) => <option value={table.id} key={table.id}>Meja {table.tableNumber}</option>)}</select></label><label>Tanggal<input className="text-field" type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></label></div>
      {visibleOrders.length ? <div className="admin-list">{visibleOrders.map((order) => <div className="admin-list-row" key={order.id}>
        <div className="admin-list-main"><strong>Meja {order.tableNumber} · {order.customerName}</strong><p>Order {order.id.slice(0, 8)} · {order.source === "QR" ? "QR" : "Kasir"} · {order.itemCount} item · {new Date(order.createdAt).toLocaleString("id-ID")} · {orderLabels[order.status]}</p></div>
        <div className="admin-row-actions">{order.status === "PENDING" && <button className="primary-button" disabled={busy === order.id} onClick={() => void confirm(order)}>{busy === order.id ? "Memproses…" : "Konfirmasi"}</button>}<Link className="secondary-button" href={`/pos/tables/${order.tableId}`}>Detail</Link></div>
      </div>)}</div> : <p className="empty-state">{loaded ? "Belum ada pesanan pada status ini." : "Memuat pesanan…"}</p>}
      {orders.length >= (orderStatus === "ALL" ? 300 : 100) && <p className="muted">Daftar dibatasi pada 100 pesanan terbaru per status. Buka meja untuk melihat semua pesanan pada sesi aktif.</p>}
    </section>
  </div>;
}
