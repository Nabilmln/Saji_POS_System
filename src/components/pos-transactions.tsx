"use client";

import { DatePicker } from "@/components/ui/date-picker";

import { useLocale } from "@/components/locale-provider";
import { formatDateTime } from "@/lib/time";

import { useCallback, useEffect, useState } from "react";
import { DetailPane } from "@/components/app-shells";
import { ReceiptPreview } from "@/components/pos-receipt";
import { Pagination, Panel, Button, Alert, LoadingState } from "@/components/ui/controls";
import { DataTable } from "@/components/ui/data-table";
import { usePagination } from "@/lib/use-pagination";
import { adminPage } from "@/lib/admin/client";


type Transaction = { id: string; tableNumber: string; method: "CASH"; grandTotalIdr: string; cashReceivedIdr: string; changeIdr: string; paidAt: string };


export function PosTransactions({ initialReceiptId = "" }: { initialReceiptId?: string }) {
  const { t, money, locale } = useLocale();
  const [hasNext, setHasNext] = useState(false);
  const [receiptId, setReceiptId] = useState(initialReceiptId);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { page, setPage, pageSize, setPageSize } = usePagination();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (from && to && from > to) { setRows([]); setError("Tanggal awal tidak boleh melewati tanggal akhir."); setLoaded(true); return; }
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    try { const result = await adminPage<Transaction>(`/api/staff/payments?${query}`); setRows(result.items); setHasNext(result.hasNext); setError(""); }
    catch { setRows([]); setError("Riwayat transaksi belum dapat dimuat. Periksa koneksi lalu coba lagi."); }
    finally { setLoaded(true); }
  }, [from, to, page, pageSize]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);
  return <div className="admin-stack"><Panel className="admin-panel">
    <div className="admin-section-head"><div><h2>{t("Riwayat pembayaran")}</h2></div><Button className="secondary-button" onClick={() => void refresh()}>{t("Segarkan")}</Button></div>
    <p className="muted">{t("Hanya pembayaran yang telah dikonfirmasi server. Struk menggunakan data transaksi saat pembayaran.")}</p>
    <div className="admin-filters"><DatePicker label="Dari tanggal" value={from} onChange={(value) => { setFrom(value); setPage(1); }} /><DatePicker label="Sampai tanggal" value={to} onChange={(value) => { setTo(value); setPage(1); }} /></div>
    {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
  </Panel><Panel><h2>{t("Daftar transaksi")}</h2>
    {!loaded ? <LoadingState>{t("Memuat transaksi\u2026")}</LoadingState> : rows.length ? <DataTable caption={t("Daftar transaksi")} columns={[t("Transaksi"), t("Meja"), t("Waktu pembayaran"), t("Total"), t("Metode"), t("Tindakan")]}>{rows.map((row) => <tr key={row.id}><th scope="row">{row.id.slice(0, 8)}</th><td>{row.tableNumber}</td><td className="date-cell">{formatDateTime(row.paidAt, locale)}</td><td className="money-cell">{money(row.grandTotalIdr)}</td><td>{t("Tunai")}</td><td><Button className="secondary-button" aria-pressed={receiptId === row.id} onClick={() => setReceiptId(row.id)}>{t("Lihat struk")}</Button></td></tr>)}</DataTable> : <p className="empty-state">{t("Belum ada transaksi lunas pada rentang ini.")}</p>}
  </Panel><Pagination pageSize={pageSize} onPageSizeChange={setPageSize} page={page} hasNext={hasNext} onChange={setPage} />{receiptId && <DetailPane><ReceiptPreview key={receiptId} paymentId={receiptId} onClose={() => setReceiptId("")} /></DetailPane>}</div>;
}
