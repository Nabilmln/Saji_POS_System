"use client";

import { useLocale } from "@/components/locale-provider";
import { formatDateTime } from "@/lib/time";

import { StatusBadge, statusLabels, orderStatusOptions } from "@/components/ui/status-badge";

import { usePolling } from "@/lib/use-polling";

import { useCallback, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { adminPage, adminApi, jsonRequest } from "@/lib/admin/client";
import { Selection, Panel, Button, Alert, Input, LoadingState, Pagination } from "@/components/ui/controls";
import { DetailPane } from "@/components/app-shells";
import { OrderDetails, type StaffOrder } from "@/components/order-details";


type Table = { id: string; tableNumber: string; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; activeOrderCount: number; pendingOrderCount: number; grandTotalIdr: string };
type Order = { id: string; tableId: string; tableNumber: string; customerName: string; source: "QR" | "MANUAL"; status: "PENDING" | "PREPARING" | "SERVED"; itemCount: number; createdAt: string };
const tableLabels = { AVAILABLE: statusLabels.AVAILABLE, OCCUPIED: statusLabels.OCCUPIED, RESERVED: statusLabels.RESERVED };

export function PosOverview() {
  const { t, locale, money } = useLocale();
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<{ id: string; tableNumber: string; orders: StaffOrder[] } | null>(null);
  const [detailError, setDetailError] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const [tablePage, setTablePage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [notice, setNotice] = useState("");
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
      const params = new URLSearchParams({ status: orderStatus, page: String(orderPage), pageSize: String(LIST_PAGE_SIZE) });
      if (orderTable) params.set("tableId", orderTable);
      if (orderDate) params.set("date", orderDate);
      const [nextTables, nextOrders] = await Promise.all([adminApi<Table[]>("/api/staff/tables"), adminPage<Order>(`/api/staff/orders?${params}`)]);
      setTables(nextTables); setOrders(nextOrders.items); setHasNext(nextOrders.hasNext); setError(""); setSyncedAt(new Date());
    } catch { setError("Data belum tersinkron. Periksa koneksi lalu coba lagi."); }
    finally { setLoaded(true); }
  }, [orderStatus, orderTable, orderDate, orderPage]);
  usePolling(refresh);
  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    try { setSelected(await adminApi(`/api/staff/tables/${selectedId}`)); setDetailError(""); }
    catch { setDetailError("Detail meja belum dapat dimuat. Coba lagi."); }
  }, [selectedId]);
  usePolling(refreshDetail);
  const visible = tables.filter((table) => (filter === "ALL" || table.status === filter) && table.tableNumber.toLowerCase().includes(query.trim().toLowerCase()));
  const currentTablePage = Math.min(tablePage, Math.max(1, Math.ceil(visible.length / LIST_PAGE_SIZE)));
  async function confirm(order: Order) {
    setBusy(order.id); setError(""); setNotice("");
    try { await adminApi(`/api/staff/orders/${order.id}/confirm`, jsonRequest("POST", {})); await refresh(); setNotice("Pesanan dikonfirmasi dan mulai disiapkan."); }
    catch { await refresh(); setError("Pesanan gagal dikonfirmasi. Muat ulang untuk melihat status terbaru."); }
    finally { setBusy(""); }
  }
  return <div className="admin-stack">
    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>{t("Ringkasan meja")}</h2></div><Button className="secondary-button" onClick={() => void refresh()}>{t("Segarkan")}</Button></div>
      <p className="muted">{syncedAt ? t("Terakhir sinkron {0}", { "0": syncedAt.toLocaleTimeString(locale === "en" ? "en-GB" : "id-ID", { timeZone: "Asia/Jakarta" }) }) : t("Menunggu data…")} {" "}{t("· Diperbarui otomatis setiap 5 detik saat tab aktif.")}</p>
      {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}{notice && <Alert toast className="inline-alert info">{t(notice)}</Alert>}
      <div className="admin-filters">
        <label>{t("Cari meja")}<Input className="text-field" value={query} maxLength={30} onChange={(event) => { setQuery(event.target.value); setTablePage(1); }} placeholder={t("Nomor meja")} /></label>
        <Selection label={t("Status meja")} value={filter} onChange={(value) => { setFilter(value); setTablePage(1); }} options={[{ value: "ALL", label: t("Semua") }, ...Object.entries(tableLabels).map(([value, label]) => ({ value, label: t(label) }))]} />
      </div>
      {!loaded ? <LoadingState className="loading-block" role="status">{t("Memuat meja…")}</LoadingState> : visible.length ? <div className="pos-table-grid">{visible.slice((currentTablePage - 1) * LIST_PAGE_SIZE, currentTablePage * LIST_PAGE_SIZE).map((table) => <Button className={`pos-table-card ${selectedId === table.id ? "selected" : ""}`} aria-pressed={selectedId === table.id} key={table.id} onClick={() => { setSelectedId(table.id); setSelected(null); }}>
        <StatusBadge status={table.status} /><h3>{t("Meja")}{" "}{table.tableNumber}</h3>
        <p>{table.pendingOrderCount} {" "}{t("menunggu ·")}{" "}{table.activeOrderCount} {" "}{t("pesanan aktif")}</p><strong>{money(table.grandTotalIdr)}</strong><span className="pos-card-link">{t("Lihat meja →")}</span>
      </Button>)}</div> : <p className="empty-state">{t("Tidak ada meja yang cocok.")}</p>}
    </Panel>
    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>{t("Inbox")}{" "}</h2></div></div>
      <div className="admin-filters"><Selection label={t("Status pesanan")} value={orderStatus} onChange={(value) => { setOrderStatus(value as Order["status"] | "ALL"); setOrderPage(1); }} options={[{ value: "ALL", label: t("Semua") }, ...orderStatusOptions.map((option) => ({ ...option, label: t(option.label) }))]} /><Selection label={t("Meja")} kind="dropdown" value={orderTable} onChange={(value) => { setOrderTable(value); setOrderPage(1); }} options={[{ value: "", label: t("Semua meja") }, ...tables.map((table) => ({ value: table.id, label: t("Meja {0}", { "0": table.tableNumber }) }))]} /><label>{t("Tanggal")}<Input className="text-field" type="date" value={orderDate} onChange={(event) => { setOrderDate(event.target.value); setOrderPage(1); }} /></label></div>
      {orders.length ? <DataTable caption={t("Inbox pesanan")} columns={[t("Order"), t("Pelanggan"), t("Meja"), t("Waktu pesanan"), t("Status"), t("Tindakan")]}>{orders.map((order) => <tr key={order.id}>
        <th scope="row">{order.id.slice(0, 8)}<small className="table-secondary">{order.source === "QR" ? "QR" : t("Kasir")} {"\u00b7"} {order.itemCount} {t("item")}</small></th><td>{order.customerName}</td><td>{order.tableNumber}</td><td className="date-cell">{formatDateTime(order.createdAt, locale)}</td><td><StatusBadge status={order.status} /></td>
        <td><div className="admin-row-actions">{order.status === "PENDING" && <Button disabled={busy === order.id} onClick={() => void confirm(order)}>{busy === order.id ? t("Memproses\u2026") : t("Konfirmasi")}</Button>}<Link className="secondary-button" href={`/pos/tables/${order.tableId}`}>{t("Detail")}</Link></div></td>
      </tr>)}</DataTable> : <p className="empty-state">{loaded ? t("Belum ada pesanan pada status ini.") : t("Memuat pesanan\u2026")}</p>}
    </Panel>
    <Pagination label="Navigasi pesanan" page={orderPage} hasNext={hasNext} onChange={setOrderPage} disabled={!!busy} />
    {selectedId && <DetailPane><div className="detail-heading"><h2>{t("Meja")}{" "}{selected?.tableNumber ?? tables.find((table) => table.id === selectedId)?.tableNumber}</h2><Button className="text-button" onClick={() => setSelectedId("")}>{t("Tutup")}</Button></div>{detailError && <p className="inline-alert" role="alert">{t(detailError)}</p>}{selected?.id === selectedId ? <OrderDetails orders={selected.orders} /> : <p className="loading-block" role="status">{t("Memuat detail...")}</p>}<Link className="primary-button full-width" href={`/pos/tables/${selectedId}`}>{t("Buka meja")}</Link></DetailPane>}
  </div>;
}
