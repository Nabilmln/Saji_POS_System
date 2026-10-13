"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Pagination, Panel, Button, Input, Alert, LoadingState } from "@/components/ui/controls";
import { adminApi } from "@/lib/admin/client";
import { formatIdr } from "@/lib/customer/cart";

type Transaction = { id: string; tableNumber: string; method: "CASH"; grandTotalIdr: string; cashReceivedIdr: string; changeIdr: string; paidAt: string };
const pageSize = 20;

export function PosTransactions() {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (from && to && from > to) { setRows([]); setError("Tanggal awal tidak boleh melewati tanggal akhir."); setLoaded(true); return; }
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    try { setRows(await adminApi<Transaction[]>(`/api/staff/payments?${query}`)); setError(""); }
    catch { setRows([]); setError("Riwayat transaksi belum dapat dimuat. Periksa koneksi lalu coba lagi."); }
    finally { setLoaded(true); }
  }, [from, to, page]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);
  return <div className="admin-stack"><Panel className="admin-panel">
    <div className="admin-section-head"><div><p className="context-label">TRANSAKSI LUNAS</p><h2>Riwayat pembayaran</h2></div><Button className="secondary-button" onClick={() => void refresh()}>Segarkan</Button></div>
    <p className="muted">Hanya pembayaran yang telah dikonfirmasi server. Struk menggunakan data transaksi saat pembayaran.</p>
    <div className="admin-filters"><label>Dari tanggal<Input className="text-field" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label>Sampai tanggal<Input className="text-field" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label></div>
    {error && <Alert className="inline-alert" role="alert">{error}</Alert>}
    {!loaded ? <LoadingState className="loading-block" role="status">Memuat transaksi…</LoadingState> : rows.length ? <div className="admin-list">{rows.map((row) => <div className="admin-list-row" key={row.id}><div className="admin-list-main"><strong>Meja {row.tableNumber} · {formatIdr(row.grandTotalIdr)}</strong><p>{new Date(row.paidAt).toLocaleString("id-ID")} · Transaksi {row.id.slice(0, 8)} · Tunai</p></div><Link className="secondary-button" href={`/pos/transactions/${row.id}`}>Lihat struk</Link></div>)}</div> : <p className="empty-state">Belum ada transaksi lunas pada rentang ini.</p>}
    <Pagination page={page} hasNext={rows.length === pageSize} onChange={setPage} />
  </Panel></div>;
}
