"use client";

import { useLocale } from "@/components/locale-provider";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ReceiptIcon, TrendUpIcon, ChartLineUpIcon } from "@phosphor-icons/react";
import { adminApi } from "@/lib/admin/client";
import { reportRangeSchema } from "@/lib/admin/report-range";
import { revenueDays, type RevenuePoint } from "@/lib/admin/report-chart";
import { formatDate, restaurantDate } from "@/lib/time";

import { LIST_PAGE_SIZE } from "@/lib/pagination";
import { DetailPane } from "@/components/app-shells";
import { RevenueChart } from "@/components/revenue-chart";
import { Button, Input, Selection, EmptyState, Alert, LoadingState, Pagination } from "@/components/ui/controls";

type Report = { summary: { revenueIdr: string; paidTransactionCount: number }; points: RevenuePoint[] };
type TopMenu = { menuName: string; quantitySold: number; grossSalesIdr: string };

export function AdminReports() {
  const { t, money, locale } = useLocale();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [preset, setPreset] = useState("week");
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [menus, setMenus] = useState<TopMenu[]>([]);
  const [busy, setBusy] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const load = useCallback(async (start: string, end: string) => {
    if (!reportRangeSchema.safeParse({ from: start, to: end }).success) { setError("Pilih rentang tanggal yang valid, maksimal 366 hari."); return; }
    setBusy(true); setError(""); setPage(1);
    try {
      const query = new URLSearchParams({ from: start, to: end });
      const [revenue, top] = await Promise.all([adminApi<Report>(`/api/admin/reports/revenue?${query}&groupBy=day`), adminApi<TopMenu[]>(`/api/admin/reports/top-menus?${query}&limit=10`)]);
      setReport(revenue); setMenus(top); setPeriod({ from: start, to: end });
    } catch { setError("Laporan belum dapat dimuat. Periksa koneksi lalu coba lagi."); }
    finally { setBusy(false); }
  }, []);
  const choosePeriod = useCallback((value: string) => {
    setPreset(value);
    if (value === "custom") return;
    const today = restaurantDate(new Date());
    const days = value === "month" ? 29 : value === "week" ? 6 : 0;
    const start = new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);
    setFrom(start); setTo(today); void load(start, today);
  }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => choosePeriod("week"), 0); return () => window.clearTimeout(timer); }, [choosePeriod]);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void load(from, to); }
  const days = period && report ? revenueDays(period.from, period.to, report.points) : [];
  const best = report?.points.reduce<RevenuePoint | null>((current, point) => !current || BigInt(point.revenueIdr) > BigInt(current.revenueIdr) ? point : current, null);
  return <div className="admin-stack">
    <form className="report-filters" onSubmit={submit}><Selection label={t("Periode penjualan")} value={preset} onChange={choosePeriod} disabled={busy} options={[{ value: "today", label: t("Hari ini") }, { value: "week", label: t("7 hari") }, { value: "month", label: t("30 hari") }, { value: "custom", label: t("Kustom") }]} />{preset === "custom" && <><label>{t("Dari tanggal")}<Input type="date" required value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>{t("Sampai tanggal")}<Input type="date" required value={to} onChange={(event) => setTo(event.target.value)} /></label></>}<Button type="submit" disabled={busy}>{busy ? t("Memuat...") : t("Tampilkan laporan")}</Button></form>
    {error && <Alert>{t(error)}</Alert>}
    {report && period ? <><p className="report-period">{formatDate(period.from, locale, "long")} {" "}{t("hingga")}{" "}{formatDate(period.to, locale, "long")} {" "}{t("· WIB · Hanya transaksi lunas")}</p><div className="sales-bento report-summary">
      <section className="bento-cell bento-revenue"><ChartLineUpIcon size={20} className="metric-icon" /><p className="metric-label">{t("Pendapatan lunas")}</p><p className="metric-value">{money(report.summary.revenueIdr)}</p><p className="metric-foot">{t("Total tagihan, setelah diskon dan pajak")}</p></section>
      <section className="bento-cell bento-count"><ReceiptIcon size={20} className="metric-icon" /><p className="metric-label">{t("Transaksi lunas")}</p><p className="metric-value">{report.summary.paidTransactionCount}</p><p className="metric-foot">{t("Pembayaran tunai penuh")}</p></section>
      <section className="bento-cell bento-average"><TrendUpIcon size={20} className="metric-icon" /><p className="metric-label">{t("Rata-rata transaksi")}</p><p className="metric-value">{money(report.summary.paidTransactionCount ? BigInt(report.summary.revenueIdr) / BigInt(report.summary.paidTransactionCount) : 0n)}</p><p className="metric-foot">{t("Pendapatan dibagi transaksi")}</p></section>
      <section className="bento-cell bento-chart"><div className="chart-heading"><h2>{t("Tren penjualan")}</h2><span className="chart-unit">{t("IDR / hari")}</span></div>{report.summary.paidTransactionCount ? <RevenueChart from={period.from} to={period.to} points={report.points} /> : <EmptyState>{t("Belum ada pembayaran lunas pada periode ini.")}</EmptyState>}</section>
      <section className="bento-cell bento-menus"><h2>{t("Menu terlaris")}</h2>{menus.length ? menus.map((menu, index) => <div className="top-menu-row" key={menu.menuName}><span className="rank">{index + 1}</span><div><strong>{menu.menuName}</strong><small>{money(menu.grossSalesIdr)} {" "}{t("sebelum diskon/pajak")}</small></div><span className="quantity">{menu.quantitySold}<small>{t("terjual")}</small></span></div>) : <EmptyState>{t("Belum ada menu terjual.")}</EmptyState>}</section>
      <section className="bento-cell bento-data"><details className="report-data"><summary>{t("Lihat angka harian")}</summary><div className="table-scroll"><table><caption>{t("Pendapatan harian (WIB)")}</caption><thead><tr><th>{t("Tanggal")}</th><th>{t("Transaksi")}</th><th>{t("Pendapatan lunas")}</th></tr></thead><tbody>{days.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE).map((day) => <tr key={day.date}><td>{formatDate(day.date, locale)}</td><td>{day.transactionCount}</td><td>{money(day.revenueIdr)}</td></tr>)}</tbody></table></div><Pagination page={page} hasNext={page * LIST_PAGE_SIZE < days.length} total={days.length} onChange={setPage} /></details></section>
    </div><DetailPane><div className="detail-heading"><h2>{t("Rincian periode")}</h2></div><dl className="period-detail"><dt>{t("Dari tanggal")}</dt><dd>{period.from}</dd><dt>{t("Sampai tanggal")}</dt><dd>{period.to}</dd><dt>{t("Zona waktu")}</dt><dd>{t("WIB / Asia Jakarta")}</dd></dl><div className="detail-rule" />{best ? <><h3>{t("Penjualan tertinggi")}</h3><p className="metric-value">{money(best.revenueIdr)}</p><p className="muted">{formatDate(best.date, locale)} · {best.transactionCount} {" "}{t("transaksi")}</p></> : <p className="muted">{t("Ringkasan tersedia setelah ada pembayaran.")}</p>}<p className="detail-note">{t("Pesanan belum lunas dan uang kembalian tidak dihitung sebagai pendapatan.")}</p></DetailPane></> : busy ? <LoadingState>{t("Memuat ringkasan penjualan...")}</LoadingState> : <EmptyState>{t("Pilih periode lalu tampilkan laporan untuk mencoba lagi.")}</EmptyState>}
  </div>;
}
