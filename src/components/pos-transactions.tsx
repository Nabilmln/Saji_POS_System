"use client";

import { useLocale } from "@/components/locale-provider";
import { formatDateTime } from "@/lib/time";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pagination, Panel, Button, Input, Alert, LoadingState } from "@/components/ui/controls";
import { DataTable } from "@/components/ui/data-table";
import { usePagination } from "@/lib/use-pagination";
import { adminPage } from "@/lib/admin/client";


type Transaction = { id: string; tableNumber: string; method: "CASH"; grandTotalIdr: string; cashReceivedIdr: string; changeIdr: string; paidAt: string };


export function PosTransactions() {
  const { t, money, locale } = useLocale();
  const [hasNext, setHasNext] = useState(false);
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
    <div className="admin-filters"><label>{t("Dari tanggal")}<Input className="text-field" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label>{t("Sampai tanggal")}<Input className="text-field" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label></div>
    {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
  </Panel><Panel><h2>{t("Daftar transaksi")}</h2>
    {!loaded ? <LoadingState>{t("Memuat transaksi\u2026")}</LoadingState> : rows.length ? <DataTable caption={t("Daftar transaksi")} columns={[t("Transaksi"), t("Meja"), t("Waktu pembayaran"), t("Total"), t("Metode"), t("Tindakan")]}>{rows.map((row) => <tr key={row.id}><th scope="row">{row.id.slice(0, 8)}</th><td>{row.tableNumber}</td><td className="date-cell">{formatDateTime(row.paidAt, locale)}</td><td className="money-cell">{money(row.grandTotalIdr)}</td><td>{t("Tunai")}</td><td><Link className="secondary-button" href={`/pos/transactions/${row.id}`}>{t("Lihat struk")}</Link></td></tr>)}</DataTable> : <p className="empty-state">{t("Belum ada transaksi lunas pada rentang ini.")}</p>}
  </Panel><Pagination pageSize={pageSize} onPageSizeChange={setPageSize} page={page} hasNext={hasNext} onChange={setPage} /></div>;
}
