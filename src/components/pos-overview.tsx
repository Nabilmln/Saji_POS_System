"use client";

import { DatePicker } from "@/components/ui/date-picker";

import { useLocale } from "@/components/locale-provider";

import { StatusBadge, statusLabels, orderStatusOptions } from "@/components/ui/status-badge";

import { usePolling } from "@/lib/use-polling";

import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { DataTable, TableDateTime } from "@/components/ui/data-table";
import { usePagination } from "@/lib/use-pagination";
import { adminPage, adminApi, jsonRequest } from "@/lib/admin/client";
import { Selection, Panel, Button, Alert, Input, LoadingState, Pagination } from "@/components/ui/controls";
import { DetailPane } from "@/components/app-shells";
import { OrderDetails, type OrderItem } from "@/components/order-details";
import { PosTable, type StaffTable } from "@/components/pos-table";
import { PosPayment } from "@/components/pos-payment";
import { ReceiptPreview } from "@/components/pos-receipt";
import { OrderItemDeletion } from "@/components/order-item-deletion";
import { PosBillPreview } from "@/components/pos-bill";
import { PosTableActions } from "@/components/pos-table-actions";


type Table = { id: string; tableNumber: string; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; activeOrderCount: number; pendingOrderCount: number; grandTotalIdr: string };
type Order = { id: string; tableId: string; tableNumber: string; customerName: string; source: "QR" | "MANUAL"; status: "PENDING" | "PREPARING" | "SERVED"; itemCount: number; createdAt: string };
const tableLabels = { AVAILABLE: statusLabels.AVAILABLE, OCCUPIED: statusLabels.OCCUPIED, RESERVED: statusLabels.RESERVED };

export function PosOverview() {
  const { t, locale, money } = useLocale();
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<StaffTable | null>(null);
  const [workspace, setWorkspace] = useState<"DETAIL" | "ORDER" | "PAYMENT">("DETAIL");
  const [paymentSessionId, setPaymentSessionId] = useState("");
  const [receipt, setReceipt] = useState<{ sessionId: string; paymentId?: never } | { paymentId: string; sessionId?: never } | null>(null);
  const [deleting, setDeleting] = useState<OrderItem | null>(null);
  const [detailError, setDetailError] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const { page: tablePage, setPage: setTablePage, pageSize: tablePageSize, setPageSize: setTablePageSize } = usePagination();
  const { page: orderPage, setPage: setOrderPage, pageSize: orderPageSize, setPageSize: setOrderPageSize } = usePagination();
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
  const [syncFailed, setSyncFailed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(sessionStorage.getItem("pos-payment-workspace") ?? "null") as { tableId?: string; sessionId?: string } | null;
        if (saved && typeof saved.tableId === "string" && typeof saved.sessionId === "string" && sessionStorage.getItem(`pos-payment:${saved.sessionId}`)) {
          setSelectedId(saved.tableId); setPaymentSessionId(saved.sessionId); setWorkspace("PAYMENT");
        } else sessionStorage.removeItem("pos-payment-workspace");
      } catch { /* Recovery storage may be unavailable or contain an invalid draft. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ status: orderStatus, page: String(orderPage), pageSize: String(orderPageSize) });
      if (orderTable) params.set("tableId", orderTable);
      if (orderDate) params.set("date", orderDate);
      const [nextTables, nextOrders] = await Promise.all([adminApi<Table[]>("/api/staff/tables"), adminPage<Order>(`/api/staff/orders?${params}`)]);
      setTables(nextTables); setOrders(nextOrders.items); setHasNext(nextOrders.hasNext); setError(""); setSyncedAt(new Date()); setSyncFailed(false);
    } catch { setError("Data belum tersinkron. Periksa koneksi lalu coba lagi."); setSyncFailed(true); }
    finally { setLoaded(true); }
  }, [orderStatus, orderTable, orderDate, orderPage, orderPageSize]);
  usePolling(refresh);
  const refreshDetail = useCallback(async () => {
    if (!selectedId) return;
    try { setSelected(await adminApi(`/api/staff/tables/${selectedId}`)); setDetailError(""); }
    catch { setDetailError("Detail meja belum dapat dimuat. Coba lagi."); }
  }, [selectedId]);
  usePolling(refreshDetail);
  const visible = tables.filter((table) => (filter === "ALL" || table.status === filter) && table.tableNumber.toLowerCase().includes(query.trim().toLowerCase()));
  const currentTablePage = Math.min(tablePage, Math.max(1, Math.ceil(visible.length / tablePageSize)));
  async function updateOrder(path: string, method: "POST" | "PATCH", body: object, action: string) {
    if (busy) return;
    setBusy(action); setError(""); setDetailError(""); setNotice("");
    try { await adminApi(path, jsonRequest(method, body)); await Promise.all([refresh(), refreshDetail()]); }
    catch { await Promise.all([refresh(), refreshDetail()]); setError("Perubahan gagal. Segarkan data dan coba lagi."); }
    finally { setBusy(""); }
  }
  function selectTable(id: string) {
    setSelectedId(id); setSelected(null); setDetailError(""); setReceipt(null); setWorkspace("DETAIL");
  }
  function openPayment(sessionId: string) {
    try { sessionStorage.setItem("pos-payment-workspace", JSON.stringify({ tableId: selectedId, sessionId })); }
    catch { setDetailError("Penyimpanan tab tidak tersedia. Aktifkan penyimpanan browser sebelum membayar."); return; }
    setPaymentSessionId(sessionId); setWorkspace("PAYMENT");
  }
  function closeWorkspace() {
    sessionStorage.removeItem("pos-payment-workspace");
    setWorkspace("DETAIL"); void refresh(); void refreshDetail();
  }
  if (workspace === "ORDER" && selectedId) return <PosTable key={selectedId} tableId={selectedId} initialManual onClose={closeWorkspace} onPayment={openPayment} />;
  if (workspace === "PAYMENT" && paymentSessionId) return <PosPayment key={paymentSessionId} sessionId={paymentSessionId} onClose={closeWorkspace} onViewReceipt={(paymentId) => { setReceipt({ paymentId }); closeWorkspace(); }} />;
  return <div className="admin-stack">
    <Panel className="admin-panel">
      <div className="admin-section-head pos-overview-head"><div><h2>{t("Ringkasan meja")}</h2></div><div className="pos-sync-actions">
        <div className="pos-sync-status" title={t("Diperbarui otomatis setiap 5 detik saat tab aktif.")}><ArrowsClockwiseIcon size={15} aria-hidden="true" /><span title={syncFailed ? t("Belum tersinkron") : syncedAt ? t("Tersinkron") : t("Menunggu data…")}>{syncFailed ? t("Belum tersinkron") : syncedAt ? t("Tersinkron") : t("Menunggu data…")}</span>{syncedAt && <time dateTime={syncedAt.toISOString()}>{syncedAt.toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour12: false })}</time>}</div>
        <Button className="secondary-button" onClick={() => void refresh()}>{t("Segarkan")}</Button>
      </div></div>
      {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}{notice && <Alert toast className="inline-alert info">{t(notice)}</Alert>}
      <div className="admin-filters">
        <label>{t("Cari meja")}<Input className="text-field" value={query} maxLength={30} onChange={(event) => { setQuery(event.target.value); setTablePage(1); }} placeholder={t("Nomor meja")} /></label>
        <Selection label={t("Status meja")} value={filter} onChange={(value) => { setFilter(value); setTablePage(1); }} options={[{ value: "ALL", label: t("Semua") }, ...Object.entries(tableLabels).map(([value, label]) => ({ value, label: t(label) }))]} />
      </div>
      {!loaded ? <LoadingState className="loading-block" role="status">{t("Memuat meja…")}</LoadingState> : visible.length ? <div className="pos-table-grid">{visible.slice((currentTablePage - 1) * tablePageSize, currentTablePage * tablePageSize).map((table) => <article className={`pos-table-card ${selectedId === table.id ? "selected" : ""}`} aria-labelledby={`table-${table.id}`} key={table.id}>
        <StatusBadge status={table.status} /><h3 id={`table-${table.id}`}>{t("Meja")}{" "}{table.tableNumber}</h3>
        <div className="pos-order-counts"><StatusBadge status="PENDING">{table.pendingOrderCount} {t("Menunggu")}</StatusBadge><StatusBadge status="ACTIVE">{table.activeOrderCount} {t("Aktif")}</StatusBadge></div>
        <strong>{money(table.grandTotalIdr)}</strong>
        <Button className="secondary-button pos-card-button" aria-label={t("Lihat meja {0}", { "0": table.tableNumber })} aria-pressed={selectedId === table.id} onClick={() => selectTable(table.id)}>{t("Lihat meja")}</Button>
      </article>)}</div> : <p className="empty-state">{t("Tidak ada meja yang cocok.")}</p>}
    </Panel>
    <Pagination label="Navigasi meja" pageSize={tablePageSize} onPageSizeChange={setTablePageSize} page={currentTablePage} hasNext={currentTablePage * tablePageSize < visible.length} total={visible.length} onChange={setTablePage} />
    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>{t("Inbox")}{" "}</h2></div></div>
      <div className="admin-filters"><Selection label={t("Status pesanan")} value={orderStatus} onChange={(value) => { setOrderStatus(value as Order["status"] | "ALL"); setOrderPage(1); }} options={[{ value: "ALL", label: t("Semua") }, ...orderStatusOptions.map((option) => ({ ...option, label: t(option.label) }))]} /><Selection label={t("Meja")} kind="dropdown" value={orderTable} onChange={(value) => { setOrderTable(value); setOrderPage(1); }} options={[{ value: "", label: t("Semua meja") }, ...tables.map((table) => ({ value: table.id, label: t("Meja {0}", { "0": table.tableNumber }) }))]} /><DatePicker label="Tanggal" value={orderDate} onChange={(value) => { setOrderDate(value); setOrderPage(1); }} /></div>
      {orders.length ? <DataTable caption={t("Inbox pesanan")} columns={[t("Order"), t("Pelanggan"), t("Meja"), t("Waktu"), t("Status"), t("Tindakan")]}>{orders.map((order) => <tr key={order.id}>
        <th scope="row">{order.id.slice(0, 8)}<small className="table-secondary">{order.source === "QR" ? "QR" : t("Kasir")} {"\u00b7"} {order.itemCount} {t("item")}</small></th><td>{order.customerName}</td><td>{order.tableNumber}</td><td className="date-cell"><TableDateTime value={order.createdAt} locale={locale} /></td><td><StatusBadge status={order.status} /></td>
        <td><div className="admin-row-actions">{order.status === "PENDING" && <Button disabled={busy === `confirm:${order.id}`} onClick={() => void updateOrder(`/api/staff/orders/${order.id}/confirm`, "POST", {}, `confirm:${order.id}`)}>{busy === `confirm:${order.id}` ? t("Memproses\u2026") : t("Konfirmasi")}</Button>}<Button className="secondary-button" onClick={() => selectTable(order.tableId)}>{t("Detail")}</Button></div></td>
      </tr>)}</DataTable> : <p className="empty-state">{loaded ? t("Belum ada pesanan pada status ini.") : t("Memuat pesanan\u2026")}</p>}
    </Panel>
    <Pagination label="Navigasi pesanan" pageSize={orderPageSize} onPageSizeChange={setOrderPageSize} page={orderPage} hasNext={hasNext} onChange={setOrderPage} disabled={!!busy} />
    {selectedId && <DetailPane footer={!receipt && selected?.id === selectedId ? <PosTableActions sessionId={selected.session?.id} reserved={selected.status === "RESERVED"} busy={Boolean(busy)} onAddOrder={() => setWorkspace("ORDER")} onReceipt={() => selected.session && setReceipt({ sessionId: selected.session.id })} onPayment={openPayment} /> : undefined}>{receipt ? <ReceiptPreview key={receipt.paymentId ?? receipt.sessionId} {...receipt} onClose={() => setReceipt(null)} /> : <><div className="detail-heading"><h2>{t("Meja")} {selected?.tableNumber ?? tables.find((table) => table.id === selectedId)?.tableNumber}</h2><Button className="text-button" onClick={() => setSelectedId("")}>{t("Tutup")}</Button></div>{detailError && <Alert>{t(detailError)}</Alert>}{selected?.id === selectedId ? <><OrderDetails orders={selected.orders} busy={busy} onConfirm={(id) => void updateOrder(`/api/staff/orders/${id}/confirm`, "POST", {}, `confirm:${id}`)} onServe={(id) => void updateOrder(`/api/staff/order-items/${id}/served`, "PATCH", { served: true }, `served:${id}`)} onVoid={setDeleting} />{selected.session && <PosBillPreview key={selected.session.id} sessionId={selected.session.id} />}</> : <LoadingState>{t("Memuat detail...")}</LoadingState>}</>}</DetailPane>}
    {deleting && <OrderItemDeletion key={deleting.id} item={deleting} onClose={() => setDeleting(null)} onDeleted={async () => { await Promise.all([refresh(), refreshDetail()]); }} />}
  </div>;
}
