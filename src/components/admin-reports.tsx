"use client";

import { useEffect, useState, type FormEvent } from "react";
import { adminApi } from "@/lib/admin/client";
import { reportRangeSchema } from "@/lib/admin/report-range";
import { revenueDays, type RevenuePoint } from "@/lib/admin/report-chart";
import { restaurantDate } from "@/lib/time";
import { formatIdr } from "@/lib/customer/cart";

type Report = { summary: { revenueIdr: string; paidTransactionCount: number }; points: RevenuePoint[] };
type TopMenu = { menuName: string; quantitySold: number; grossSalesIdr: string };

export function AdminReports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [menus, setMenus] = useState<TopMenu[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => { const today = restaurantDate(new Date()); setFrom(today); setTo(today); void load(today, today); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  async function load(start: string, end: string) {
    if (!reportRangeSchema.safeParse({ from: start, to: end }).success) { setError("Pilih rentang tanggal yang valid, maksimal 366 hari."); return; }
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ from: start, to: end });
      const [revenue, top] = await Promise.all([adminApi<Report>(`/api/admin/reports/revenue?${query}&groupBy=day`), adminApi<TopMenu[]>(`/api/admin/reports/top-menus?${query}&limit=10`)]);
      setReport(revenue); setMenus(top); setPeriod({ from: start, to: end });
    } catch { setError("Laporan belum dapat dimuat. Periksa koneksi lalu coba lagi."); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load(from, to); }
  const days = period && report ? revenueDays(period.from, period.to, report.points) : [];
  const maximum = days.reduce((max, day) => BigInt(day.revenueIdr) > max ? BigInt(day.revenueIdr) : max, 0n);
  const coords = days.map((day, index) => ({ ...day, x: 60 + (days.length === 1 ? 300 : index * 600 / (days.length - 1)), y: 210 - (maximum ? Number(BigInt(day.revenueIdr) * 17000n / maximum) / 100 : 0) }));
  return <div className="admin-stack"><section className="admin-panel"><h2>Penjualan dari transaksi lunas</h2><p className="muted">Pendapatan memakai total tagihan Paid. Uang diterima dan kembalian tidak dihitung sebagai pendapatan tambahan.</p>
    <form className="report-filters" onSubmit={submit}><label>Dari tanggal<input className="text-field" type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Sampai tanggal<input className="text-field" type="date" required value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="primary-button" disabled={busy}>{busy ? "Memuat…" : "Tampilkan laporan"}</button></form>
    {error && <div className="inline-alert" role="alert">{error}</div>}
    {report && period ? <><p className="muted">Periode {period.from} hingga {period.to} · WIB</p><dl className="report-summary"><div><dt>Pendapatan lunas</dt><dd>{formatIdr(report.summary.revenueIdr)}</dd></div><div><dt>Transaksi lunas</dt><dd>{report.summary.paidTransactionCount}</dd></div><div><dt>Rata-rata transaksi</dt><dd>{formatIdr(report.summary.paidTransactionCount ? BigInt(report.summary.revenueIdr) / BigInt(report.summary.paidTransactionCount) : 0n)}</dd></div></dl>
      {report.summary.paidTransactionCount ? <><svg className="revenue-chart" viewBox="0 0 720 265" role="img" aria-labelledby="revenue-chart-title revenue-chart-desc"><title id="revenue-chart-title">Pendapatan lunas harian</title><desc id="revenue-chart-desc">Total {formatIdr(report.summary.revenueIdr)} dari {report.summary.paidTransactionCount} transaksi. Angka per hari tersedia pada tabel di bawah.</desc><line x1="60" y1="210" x2="660" y2="210" stroke="var(--border)" /><line x1="60" y1="40" x2="60" y2="210" stroke="var(--border)" /><text x="60" y="25" fill="var(--text-muted)">{formatIdr(maximum)}</text><text x="42" y="215" textAnchor="end" fill="var(--text-muted)">0</text><polyline points={coords.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth="3" />{coords.length <= 31 && coords.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="4" fill="var(--primary)"><title>{point.date}: {formatIdr(point.revenueIdr)}</title></circle>)}<text x="60" y="247" fill="var(--text-muted)">{period.from}</text><text x="660" y="247" textAnchor="end" fill="var(--text-muted)">{period.to}</text></svg><details className="report-data"><summary>Lihat angka harian</summary><div className="table-scroll"><table><caption>Pendapatan harian (WIB)</caption><thead><tr><th>Tanggal</th><th>Transaksi</th><th>Pendapatan lunas</th></tr></thead><tbody>{days.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.transactionCount}</td><td>{formatIdr(day.revenueIdr)}</td></tr>)}</tbody></table></div></details></> : <p className="empty-state">Belum ada pembayaran lunas pada periode ini.</p>}
    </> : <p className="loading-block" role="status">Pilih periode untuk memuat laporan.</p>}
  </section><section className="admin-panel"><h2>Menu terlaris</h2><p className="muted">Jumlah terjual hanya dari sesi Paid; nilai menu sebelum diskon dan pajak.</p>{menus.length ? <div className="table-scroll"><table><caption>10 menu terlaris pada periode laporan</caption><thead><tr><th>Menu</th><th>Jumlah terjual</th><th>Nilai penjualan menu</th></tr></thead><tbody>{menus.map((menu) => <tr key={menu.menuName}><td>{menu.menuName}</td><td>{menu.quantitySold}</td><td>{formatIdr(menu.grossSalesIdr)}</td></tr>)}</tbody></table></div> : <p className="empty-state">Belum ada penjualan menu untuk ditampilkan.</p>}</section></div>;
}
