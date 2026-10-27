"use client";

import { DatePicker } from "@/components/ui/date-picker";

import { useLocale } from "@/components/locale-provider";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ReceiptIcon, TrendUpIcon, ChartLineUpIcon, CalendarDotsIcon } from "@phosphor-icons/react";
import { EntranceMotion } from "@/components/ui/entrance-motion";
import { adminApi } from "@/lib/admin/client";
import { reportRangeSchema } from "@/lib/admin/report-range";
import { revenueDays, revenueInsights, type RevenuePoint } from "@/lib/admin/report-chart";
import { formatDate, restaurantDate } from "@/lib/time";

import { usePagination } from "@/lib/use-pagination";
import { DetailPane } from "@/components/app-shells";
import { RevenueChart } from "@/components/revenue-chart";
import { DataTable } from "@/components/ui/data-table";
import { Button, Selection, EmptyState, Alert, LoadingState, Pagination } from "@/components/ui/controls";
import { Photo } from "@/components/ui/photo";

type Report = { summary: { revenueIdr: string; paidTransactionCount: number }; points: RevenuePoint[] };
type TopMenu = { menuName: string; quantitySold: number; grossSalesIdr: string; imageUrl?: string | null };

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
      const [revenue, top] = await Promise.all([adminApi<Report>(`/api/admin/reports/revenue?${query}&groupBy=day`), adminApi<TopMenu[]>(`/api/admin/reports/top-menus?${query}&limit=5`)]);
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
  const count = new Intl.NumberFormat(locale === "en" ? "en-GB" : "id-ID");
  const metrics = report ? [
    { label: "Pendapatan lunas", value: money(report.summary.revenueIdr), note: "Total tagihan, setelah diskon dan pajak", Icon: ChartLineUpIcon, className: "bento-revenue" },
    { label: "Transaksi lunas", value: count.format(report.summary.paidTransactionCount), note: "Pembayaran tunai penuh", Icon: ReceiptIcon, className: "bento-count" },
    { label: "Rata-rata transaksi", value: money(report.summary.paidTransactionCount ? BigInt(report.summary.revenueIdr) / BigInt(report.summary.paidTransactionCount) : 0n), note: "Pendapatan dibagi transaksi", Icon: TrendUpIcon, className: "bento-average" },
    { label: "Rata-rata per hari", value: money(insights.averageDailyIdr), note: "Termasuk hari tanpa pembayaran", Icon: CalendarDotsIcon, className: "bento-daily-average" },
  ] : [];
  const peakShare = insights.bestSharePercent === null ? null : new Intl.NumberFormat(locale === "en" ? "en-GB" : "id-ID", { style: "percent", maximumFractionDigits: 1 }).format(insights.bestSharePercent / 100);
  return <div className="admin-stack">
    <form className="report-filters" onSubmit={submit}><Selection label={t("Periode penjualan")} value={preset} onChange={choosePeriod} disabled={busy} options={[{ value: "today", label: t("Hari ini") }, { value: "week", label: t("7 hari") }, { value: "month", label: t("30 hari") }, { value: "custom", label: t("Kustom") }]} />{preset === "custom" && <><DatePicker label="Dari tanggal" required disabled={busy} value={from} onChange={setFrom} /><DatePicker label="Sampai tanggal" required disabled={busy} value={to} onChange={setTo} /></>}<Button type="submit" disabled={busy}>{busy ? t("Memuat...") : t("Tampilkan laporan")}</Button></form>
    {error && <Alert>{t(error)}</Alert>}
    {report && period ? <><p className="report-period"><span>{formatDate(period.from, locale, "long")} {t("hingga")} {formatDate(period.to, locale, "long")}</span><span>{t("Hanya transaksi lunas")} · WIB</span></p><div className="sales-bento report-summary" aria-busy={busy}>
      {metrics.map(({ label, value, note, Icon, className }) => <section className={`bento-cell bento-stat ${className}`} key={label}><div className="metric-heading"><Icon size={17} className="metric-icon" aria-hidden="true" /><h2 className="metric-label">{t(label)}</h2></div><p className="metric-value">{value}</p><p className="metric-foot">{t(note)}</p></section>)}
      <section className="bento-cell bento-chart"><div className="chart-heading"><h2>{t("Tren penjualan")}</h2><span className="chart-unit"><i aria-hidden="true" />{t("IDR / hari")}</span></div>{report.summary.paidTransactionCount ? <RevenueChart from={period.from} to={period.to} points={report.points} /> : <EmptyState>{t("Belum ada pembayaran lunas pada periode ini.")}</EmptyState>}<p className="chart-caption">{t("Pendapatan berdasarkan tanggal pembayaran, dalam WIB.")}</p></section>
      <section className="bento-cell bento-activity"><div className="chart-heading"><h2>{t("Aktivitas penjualan")}</h2><span className="chart-unit">{t("{0} hari", { 0: days.length })}</span></div><SalesActivity paidDays={insights.paidDays} totalDays={days.length} revision={report.points} /><dl className="activity-legend"><div><dt><i aria-hidden="true" />{t("Dengan pembayaran")}</dt><dd>{count.format(insights.paidDays)}</dd></div><div><dt><i aria-hidden="true" />{t("Tanpa pembayaran")}</dt><dd>{count.format(days.length - insights.paidDays)}</dd></div></dl><p className="chart-caption">{t("Hari dengan setidaknya satu transaksi lunas.")}</p></section>
      <section className="bento-cell bento-menus"><div className="chart-heading"><h2>{t("Menu terlaris")}</h2><span className="chart-unit">{t("5 menu teratas")}</span></div><p className="section-caption">{t("Penjualan kotor sebelum diskon dan pajak")}</p>{menus.length ? <div className="top-menus-stair">{menus.map((menu, index) => <article className={`top-menu-card top-menu-row ${index === 0 ? "is-first-rank" : ""}`} key={menu.menuName}><div className="top-menu-card-media"><Photo src={menu.imageUrl ?? null} menuName={menu.menuName} alt={menu.menuName} className="top-menu-photo-frame" /><span className={`rank top-menu-rank-badge ${index === 0 ? "is-champion" : ""}`}>#{count.format(index + 1)}</span></div><div className="top-menu-card-body"><strong className="top-menu-card-name" title={menu.menuName}>{menu.menuName}</strong></div><div className="top-menu-card-footer"><span className="quantity top-menu-card-qty"><strong>{count.format(menu.quantitySold)}</strong> <small>{t("terjual")}</small></span><strong className="money top-menu-card-sales">{money(menu.grossSalesIdr)}</strong></div></article>)}</div> : <EmptyState>{t("Belum ada menu terjual.")}</EmptyState>}</section>
      <div className="bento-daily"><section className="bento-cell report-data"><div className="chart-heading"><h2>{t("Angka harian")}</h2><span className="chart-unit">WIB</span></div><p className="section-caption">{t("Rincian transaksi dan pendapatan per hari")}</p><DataTable revision={JSON.stringify([page, pageSize, days])} caption={t("Pendapatan harian (WIB)")} columns={[t("Tanggal"), t("Transaksi"), t("Pendapatan lunas")]}>{days.slice((page - 1) * pageSize, page * pageSize).map((day) => <tr key={day.date}><th scope="row" className="date-cell"><time dateTime={day.date}>{formatDate(day.date, locale)}</time></th><td>{count.format(day.transactionCount)}</td><td className="money-cell">{money(day.revenueIdr)}</td></tr>)}</DataTable></section><Pagination pageSize={pageSize} onPageSizeChange={setPageSize} page={page} hasNext={page * pageSize < days.length} total={days.length} onChange={setPage} /></div>
    </div><DetailPane revision={JSON.stringify([period, report])}>
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
          {/* <p className="insight-caption">{t("Rata-rata mencakup semua hari dalam periode, termasuk hari tanpa pembayaran.")}</p> */}
        </section>
        {/* <p className="insight-scope">{t("Pesanan belum lunas dan uang kembalian tidak dihitung sebagai pendapatan.")}</p> */}
      </section>
    </DetailPane></> : busy ? <LoadingState variant="report">{t("Memuat ringkasan penjualan...")}</LoadingState> : <EmptyState>{t("Pilih periode lalu tampilkan laporan untuk mencoba lagi.")}</EmptyState>}
  </div>;
}

function SalesActivity({ paidDays, totalDays, revision }: { paidDays: number; totalDays: number; revision: RevenuePoint[] }) {
  const { t } = useLocale();
  const plot = useRef<SVGGElement>(null);
  const share = totalDays ? paidDays / totalDays * 100 : 0;
  return <div className="sales-activity-chart"><svg viewBox="0 0 180 180" role="img" aria-label={t("{0} dari {1} hari memiliki pembayaran lunas", { 0: paidDays, 1: totalDays })}><circle cx="90" cy="90" r="68" fill="none" stroke="var(--border)" strokeWidth="18" /><g ref={plot}><circle cx="90" cy="90" r="68" fill="none" stroke="var(--primary)" strokeWidth="18" pathLength="100" strokeDasharray={`${share} 100`} transform="rotate(-90 90 90)" /></g></svg><div className="activity-chart-label" aria-hidden="true"><strong>{paidDays}<span> / {totalDays}</span></strong><span>{t("Hari penjualan")}</span></div><Suspense fallback={null}><EntranceMotion target={plot} variant="chart" revision={revision} /></Suspense></div>;
}
