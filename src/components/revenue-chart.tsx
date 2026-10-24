"use client";

import { useLocale } from "@/components/locale-provider";

import { formatDate } from "@/lib/time";
import { Suspense, useId, useRef, useState } from "react";
import { revenueDays, type RevenuePoint } from "@/lib/admin/report-chart";
import { EntranceMotion } from "@/components/ui/entrance-motion";


export function RevenueChart({ from, to, points }: { from: string; to: string; points: RevenuePoint[] }) {
  const { money, t, locale } = useLocale();
  const id = useId();
  const plot = useRef<SVGGElement>(null);
  const [activeDate, setActiveDate] = useState("");
  const days = revenueDays(from, to, points);
  const maximum = days.reduce((max, day) => BigInt(day.revenueIdr) > max ? BigInt(day.revenueIdr) : max, 0n);
  const coordinates = days.map((day, index) => ({ ...day, x: 64 + (days.length === 1 ? 258 : index * 516 / (days.length - 1)), y: 205 - (maximum ? Number(BigInt(day.revenueIdr) * 15500n / maximum) / 100 : 0) }));
  const selected = days.find((day) => day.date === activeDate) ?? days.at(-1);
  const compact = (amount: bigint) => new Intl.NumberFormat(locale === "en" ? "en-GB" : "id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(amount);
  const path = coordinates.map((point, index) => {
    const previous = coordinates[index - 1];
    if (!previous) return `M ${point.x} ${point.y}`;
    const middle = (previous.x + point.x) / 2;
    return `C ${middle} ${previous.y} ${middle} ${point.y} ${point.x} ${point.y}`;
  }).join(" ");
  return <div className="revenue-chart-wrap"><div className="chart-output"><span>{selected ? formatDate(selected.date, locale) : ""}<small>{t("{0} transaksi", { 0: selected?.transactionCount ?? 0 })}</small></span><strong>{money(selected?.revenueIdr ?? "0")}</strong></div><svg className="revenue-chart" viewBox="0 0 620 245" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
    <title id={`${id}-title`}>{t("Pendapatan lunas harian")}</title><desc id={`${id}-desc`}>{t("Pendapatan dari")}{" "}{formatDate(from, locale)} {" "}{t("hingga")}{" "}{formatDate(to, locale)}{t(". Angka lengkap tersedia pada tabel harian.")}</desc>
    {[0, 1, 2, 3].map((tick) => <g key={tick}><line x1="64" x2="580" y1={205 - tick * 155 / 3} y2={205 - tick * 155 / 3} stroke="var(--border)" strokeDasharray={tick ? "3 5" : undefined} /><text x="51" y={209 - tick * 155 / 3} textAnchor="end">{compact(maximum * BigInt(tick) / 3n)}</text></g>)}
    <g ref={plot} className="revenue-plot">
    {coordinates.length > 1 && <path d={`${path} L ${coordinates.at(-1)?.x} 205 L ${coordinates[0].x} 205 Z`} fill="var(--primary-soft)" />}
    <path d={path} fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
    {coordinates.length <= 31 && coordinates.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r={point.date === activeDate ? 5 : 3} fill="var(--accent-ink)" tabIndex={0} aria-label={`${formatDate(point.date, locale)}: ${money(point.revenueIdr)}`} onMouseEnter={() => setActiveDate(point.date)} onFocus={() => setActiveDate(point.date)}><title>{formatDate(point.date, locale)}: {money(point.revenueIdr)}</title></circle>)}
    </g>
    {days.length === 1 ? <text x="322" y="233" textAnchor="middle">{formatDate(from, locale)}</text> : <><text x="64" y="233">{formatDate(from, locale)}</text><text x="580" y="233" textAnchor="end">{formatDate(to, locale)}</text></>}
  </svg><Suspense fallback={null}><EntranceMotion target={plot} variant="chart" revision={points} /></Suspense></div>;
}
