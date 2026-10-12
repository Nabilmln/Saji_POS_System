"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  return <div className="admin-stack"><section className="admin-panel">
    <div className="admin-section-head"><div><p className="eyebrow">TRANSAKSI LUNAS</p><h2>Riwayat pembayaran</h2></div><button className="secondary-button" onClick={() => void refresh()}>Segarkan</button></div>
    <p className="muted">Hanya pembayaran yang telah dikonfirmasi server. Struk menggunakan data transaksi saat pembayaran.</p>
    <div className="admin-filters"><label>Dari tanggal<input className="text-field" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label><label>Sampai tanggal<input className="text-field" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label></div>
    {error && <div className="inline-alert" role="alert">{error}</div>}
    {!loaded ? <div className="loading-block" role="status">Memuat transaksi…</div> : rows.length ? <div className="admin-list">{rows.map((row) => <div className="admin-list-row" key={row.id}><div className="admin-list-main"><strong>Meja {row.tableNumber} · {formatIdr(row.grandTotalIdr)}</strong><p>{new Date(row.paidAt).toLocaleString("id-ID")} · Transaksi {row.id.slice(0, 8)} · Tunai</p></div><Link className="secondary-button" href={`/pos/transactions/${row.id}`}>Lihat struk</Link></div>)}</div> : <p className="empty-state">Belum ada transaksi lunas pada rentang ini.</p>}
    <div className="pagination"><span>Halaman {page}</span><div><button className="secondary-button" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Sebelumnya</button><button className="secondary-button" disabled={rows.length < pageSize} onClick={() => setPage((current) => current + 1)}>Berikutnya</button></div></div>
  </section></div>;
}
