"use client";

import { useLocale } from "@/components/locale-provider";

import { StatusBadge, statusLabels, orderStatusOptions } from "@/components/ui/status-badge";

import { restaurantDate } from "@/lib/time";
import { usePolling } from "@/lib/use-polling";

import { useCallback, useState } from "react";
import Link from "next/link";
import { adminApi, jsonRequest } from "@/lib/admin/client";
import { Selection, Panel, Button, Alert, Input, LoadingState } from "@/components/ui/controls";
import { DetailPane } from "@/components/app-shells";
import { OrderDetails, type StaffOrder } from "@/components/order-details";


type Table = { id: string; tableNumber: string; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; activeOrderCount: number; pendingOrderCount: number; grandTotalIdr: string };
type Order = { id: string; tableId: string; tableNumber: string; customerName: string; source: "QR" | "MANUAL"; status: "PENDING" | "PREPARING" | "SERVED"; itemCount: number; createdAt: string };
const tableLabels = { AVAILABLE: statusLabels.AVAILABLE, OCCUPIED: statusLabels.OCCUPIED, RESERVED: statusLabels.RESERVED };
const orderLabels = { PENDING: statusLabels.PENDING, PREPARING: statusLabels.PREPARING, SERVED: statusLabels.SERVED };

export function PosOverview() {
  const { t, locale, money } = useLocale();
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<{ id: string; tableNumber: string; orders: StaffOrder[] } | null>(null);
  const [detailError, setDetailError] = useState("");
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
  usePolling(refresh);
  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    try { setSelected(await adminApi(`/api/staff/tables/${selectedId}`)); setDetailError(""); }
    catch { setDetailError("Detail meja belum dapat dimuat. Coba lagi."); }
  }, [selectedId]);
  usePolling(refreshDetail);
  const visible = tables.filter((table) => (filter === "ALL" || table.status === filter) && table.tableNumber.toLowerCase().includes(query.trim().toLowerCase()));
  const visibleOrders = orders.filter((order) => (!orderTable || order.tableId === orderTable) && (!orderDate || restaurantDate(new Date(order.createdAt)) === orderDate));
  async function confirm(order: Order) {
    setBusy(order.id); setError("");
    try { await adminApi(`/api/staff/orders/${order.id}/confirm`, jsonRequest("POST", {})); await refresh(); }
    catch { await refresh(); setError("Pesanan gagal dikonfirmasi. Muat ulang untuk melihat status terbaru."); }
    finally { setBusy(""); }
  }
  return <div className="admin-stack">
    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>{t("Ringkasan meja")}</h2></div><Button className="secondary-button" onClick={() => void refresh()}>{t("Segarkan")}</Button></div>
      <p className="muted">{syncedAt ? t("Terakhir sinkron {0}", { "0": syncedAt.toLocaleTimeString(locale === "en" ? "en-GB" : "id-ID", { timeZone: "Asia/Jakarta" }) }) : t("Menunggu data…")} {" "}{t("· Diperbarui otomatis setiap 5 detik saat tab aktif.")}</p>
      {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
      <div className="admin-filters">
        <label>{t("Cari meja")}<Input className="text-field" value={query} maxLength={30} onChange={(event) => setQuery(event.target.value)} placeholder={t("Nomor meja")} /></label>
        <Selection label={t("Status meja")} value={filter} onChange={setFilter} options={[{ value: "ALL", label: t("Semua") }, ...Object.entries(tableLabels).map(([value, label]) => ({ value, label: t(label) }))]} />
      </div>
      {!loaded ? <LoadingState className="loading-block" role="status">{t("Memuat meja…")}</LoadingState> : visible.length ? <div className="pos-table-grid">{visible.map((table) => <Button className={`pos-table-card ${selectedId === table.id ? "selected" : ""}`} aria-pressed={selectedId === table.id} key={table.id} onClick={() => { setSelectedId(table.id); setSelected(null); }}>
        <StatusBadge status={table.status} /><h3>{t("Meja")}{" "}{table.tableNumber}</h3>
        <p>{table.pendingOrderCount} {" "}{t("menunggu ·")}{" "}{table.activeOrderCount} {" "}{t("pesanan aktif")}</p><strong>{money(table.grandTotalIdr)}</strong><span className="pos-card-link">{t("Lihat meja →")}</span>
      </Button>)}</div> : <p className="empty-state">{t("Tidak ada meja yang cocok.")}</p>}
    </Panel>
    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>{t("Inbox")}{" "}{visibleOrders.length > 0 && <small className="muted">({visibleOrders.length})</small>}</h2></div></div>
      <div className="admin-filters"><Selection label={t("Status pesanan")} value={orderStatus} onChange={(value) => setOrderStatus(value as Order["status"] | "ALL")} options={[{ value: "ALL", label: t("Semua") }, ...orderStatusOptions.map((option) => ({ ...option, label: t(option.label) }))]} /><Selection label={t("Meja")} kind="dropdown" value={orderTable} onChange={setOrderTable} options={[{ value: "", label: t("Semua meja") }, ...tables.map((table) => ({ value: table.id, label: t("Meja {0}", { "0": table.tableNumber }) }))]} /><label>{t("Tanggal")}<Input className="text-field" type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></label></div>
      {visibleOrders.length ? <div className="admin-list">{visibleOrders.map((order) => <div className="admin-list-row" key={order.id}>
        <div className="admin-list-main"><strong>{t("Meja")}{" "}{order.tableNumber} · {order.customerName}</strong><p>{t("Order")}{" "}{order.id.slice(0, 8)} · {order.source === "QR" ? "QR" : t("Kasir")} · {order.itemCount} {" "}{t("item ·")}{" "}{new Date(order.createdAt).toLocaleString(locale === "en" ? "en-GB" : "id-ID", { timeZone: "Asia/Jakarta" })} · {t(orderLabels[order.status])}</p></div>
        <div className="admin-row-actions">{order.status === "PENDING" && <Button className="primary-button" disabled={busy === order.id} onClick={() => void confirm(order)}>{busy === order.id ? t("Memproses…") : t("Konfirmasi")}</Button>}<Link className="secondary-button" href={`/pos/tables/${order.tableId}`}>{t("Detail")}</Link></div>
      </div>)}</div> : <p className="empty-state">{loaded ? t("Belum ada pesanan pada status ini.") : t("Memuat pesanan…")}</p>}
      {orders.length >= (orderStatus === "ALL" ? 300 : 100) && <p className="muted">{t("Daftar dibatasi pada 100 pesanan terbaru per status. Buka meja untuk melihat semua pesanan pada sesi aktif.")}</p>}
    </Panel>
    {selectedId && <DetailPane><div className="detail-heading"><h2>{t("Meja")}{" "}{selected?.tableNumber ?? tables.find((table) => table.id === selectedId)?.tableNumber}</h2><Button className="text-button" onClick={() => setSelectedId("")}>{t("Tutup")}</Button></div>{detailError && <p className="inline-alert" role="alert">{t(detailError)}</p>}{selected?.id === selectedId ? <OrderDetails orders={selected.orders} /> : <p className="loading-block" role="status">{t("Memuat detail...")}</p>}<Link className="primary-button full-width" href={`/pos/tables/${selectedId}`}>{t("Buka meja")}</Link></DetailPane>}
  </div>;
}
