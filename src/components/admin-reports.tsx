"use client";

import { DatePicker } from "@/components/ui/date-picker";

import { useLocale } from "@/components/locale-provider";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ReceiptIcon, TrendUpIcon, ChartLineUpIcon } from "@phosphor-icons/react";
import { adminApi } from "@/lib/admin/client";
import { reportRangeSchema } from "@/lib/admin/report-range";
import { revenueDays, revenueInsights, type RevenuePoint } from "@/lib/admin/report-chart";
import { formatDate, restaurantDate } from "@/lib/time";

import { usePagination } from "@/lib/use-pagination";
import { DetailPane } from "@/components/app-shells";
import { RevenueChart } from "@/components/revenue-chart";
import { DataTable } from "@/components/ui/data-table";
import { Button, Selection, EmptyState, Alert, LoadingState, Pagination } from "@/components/ui/controls";

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
  const { page, setPage, pageSize, setPageSize } = usePagination();
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
  }, [setPage]);
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
  const insights = revenueInsights(days);
  const peakShare = insights.bestSharePercent === null ? null : new Intl.NumberFormat(locale === "en" ? "en-GB" : "id-ID", { style: "percent", maximumFractionDigits: 1 }).format(insights.bestSharePercent / 100);
  return <div className="admin-stack">
    <form className="report-filters" onSubmit={submit}><Selection label={t("Periode penjualan")} value={preset} onChange={choosePeriod} disabled={busy} options={[{ value: "today", label: t("Hari ini") }, { value: "week", label: t("7 hari") }, { value: "month", label: t("30 hari") }, { value: "custom", label: t("Kustom") }]} />{preset === "custom" && <><DatePicker label="Dari tanggal" required disabled={busy} value={from} onChange={setFrom} /><DatePicker label="Sampai tanggal" required disabled={busy} value={to} onChange={setTo} /></>}<Button type="submit" disabled={busy}>{busy ? t("Memuat...") : t("Tampilkan laporan")}</Button></form>
    {error && <Alert>{t(error)}</Alert>}
    {report && period ? <><p className="report-period">{formatDate(period.from, locale, "long")} {" "}{t("hingga")}{" "}{formatDate(period.to, locale, "long")} {" "}{t("· WIB · Hanya transaksi lunas")}</p><div className="sales-bento report-summary">
      <section className="bento-cell bento-revenue"><ChartLineUpIcon size={20} className="metric-icon" /><p className="metric-label">{t("Pendapatan lunas")}</p><p className="metric-value">{money(report.summary.revenueIdr)}</p><p className="metric-foot">{t("Total tagihan, setelah diskon dan pajak")}</p></section>
      <section className="bento-cell bento-count"><ReceiptIcon size={20} className="metric-icon" /><p className="metric-label">{t("Transaksi lunas")}</p><p className="metric-value">{report.summary.paidTransactionCount}</p><p className="metric-foot">{t("Pembayaran tunai penuh")}</p></section>
      <section className="bento-cell bento-average"><TrendUpIcon size={20} className="metric-icon" /><p className="metric-label">{t("Rata-rata transaksi")}</p><p className="metric-value">{money(report.summary.paidTransactionCount ? BigInt(report.summary.revenueIdr) / BigInt(report.summary.paidTransactionCount) : 0n)}</p><p className="metric-foot">{t("Pendapatan dibagi transaksi")}</p></section>
      <section className="bento-cell bento-chart"><div className="chart-heading"><h2>{t("Tren penjualan")}</h2><span className="chart-unit">{t("IDR / hari")}</span></div>{report.summary.paidTransactionCount ? <RevenueChart from={period.from} to={period.to} points={report.points} /> : <EmptyState>{t("Belum ada pembayaran lunas pada periode ini.")}</EmptyState>}</section>
      <section className="bento-cell bento-menus"><h2>{t("Menu terlaris")}</h2>{menus.length ? menus.map((menu, index) => <div className="top-menu-row" key={menu.menuName}><span className="rank">{index + 1}</span><div><strong>{menu.menuName}</strong><small>{money(menu.grossSalesIdr)} {" "}{t("sebelum diskon/pajak")}</small></div><span className="quantity">{menu.quantitySold}<small>{t("terjual")}</small></span></div>) : <EmptyState>{t("Belum ada menu terjual.")}</EmptyState>}</section>
      <section className="bento-cell bento-data"><details className="report-data"><summary>{t("Lihat angka harian")}</summary><DataTable caption={t("Pendapatan harian (WIB)")} columns={[t("Tanggal"), t("Transaksi"), t("Pendapatan lunas")]}>{days.slice((page - 1) * pageSize, page * pageSize).map((day) => <tr key={day.date}><th scope="row" className="date-cell">{formatDate(day.date, locale)}</th><td>{day.transactionCount}</td><td className="money-cell">{money(day.revenueIdr)}</td></tr>)}</DataTable><Pagination pageSize={pageSize} onPageSizeChange={setPageSize} page={page} hasNext={page * pageSize < days.length} total={days.length} onChange={setPage} /></details></section>
    </div><DetailPane>
      <section className="report-insights" aria-label={t("Rincian periode")} aria-busy={busy}>
        <div className="detail-heading"><h2>{t("Rincian periode")}</h2></div>
        <div className="insight-period">
          <div className="insight-period-meta"><span>{t(days.length === 1 ? "1 hari" : "{0} hari", { 0: days.length })}</span><span title="Asia/Jakarta">WIB · UTC+7</span></div>
          <dl className="insight-dates">
            <div><dt>{t("Dari tanggal")}</dt><dd><time dateTime={period.from}>{formatDate(period.from, locale)}</time></dd></div>
            <div><dt>{t("Sampai tanggal")}</dt><dd><time dateTime={period.to}>{formatDate(period.to, locale)}</time></dd></div>
          </dl>
        </div>
        {busy && <p className="insight-updating" role="status">{t("Memperbarui ringkasan…")}</p>}
        <section className="insight-peak" aria-label={t("Penjualan tertinggi")}>
          <h3>{t("Penjualan tertinggi")}</h3>
          {insights.best ? <>
            <p className="insight-amount">{money(insights.best.revenueIdr)}</p>
            <p className="insight-peak-date"><time dateTime={insights.best.date}>{formatDate(insights.best.date, locale)}</time><span>{t(insights.best.transactionCount === 1 ? "1 transaksi" : "{0} transaksi", { 0: insights.best.transactionCount })}</span></p>
            {peakShare !== null && <div className="insight-share">
              <p><strong>{peakShare}</strong> {t("dari pendapatan periode")}</p>
              <div className="insight-share-track" aria-hidden="true"><span style={{ width: `${insights.bestSharePercent}%` }} /></div>
            </div>}
          </> : <p className="insight-empty">{t("Belum ada pembayaran lunas pada periode ini.")}</p>}
        </section>
        <section className="insight-activity" aria-label={t("Ritme penjualan")}>
          <h3>{t("Ritme penjualan")}</h3>
          <dl>
            <div className="insight-daily-average"><dt>{t("Rata-rata per hari")}</dt><dd>{money(insights.averageDailyIdr)}</dd></div>
            <div><dt>{t("Hari dengan transaksi lunas")}</dt><dd>{insights.paidDays}<span> / {days.length}</span></dd></div>
            <div><dt>{t("Hari tanpa transaksi lunas")}</dt><dd>{days.length - insights.paidDays}</dd></div>
          </dl>
          <p className="insight-caption">{t("Rata-rata mencakup semua hari dalam periode, termasuk hari tanpa pembayaran.")}</p>
        </section>
        <p className="insight-scope">{t("Pesanan belum lunas dan uang kembalian tidak dihitung sebagai pendapatan.")}</p>
      </section>
    </DetailPane></> : busy ? <LoadingState variant="report">{t("Memuat ringkasan penjualan...")}</LoadingState> : <EmptyState>{t("Pilih periode lalu tampilkan laporan untuk mencoba lagi.")}</EmptyState>}
  </div>;
}
