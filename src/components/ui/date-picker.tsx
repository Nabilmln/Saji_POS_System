"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { useLocale } from "@/components/locale-provider";
import { Button, Input } from "@/components/ui/controls";
import { calendarDate, formatDateInput, parseDateInput, shiftCalendarMonth, type DateInputType } from "@/lib/date-input";
import { restaurantDate } from "@/lib/time";

export function DatePicker({ label, value: controlledValue, onChange, name, required = false, disabled = false, type = "date" }: {
  label: string; value?: string; onChange?: (value: string) => void; name?: string; required?: boolean; disabled?: boolean; type?: DateInputType;
}) {
  const { t, locale } = useLocale();
  const id = useId(), calendarId = `${id}-calendar`;
  const field = useRef<HTMLInputElement>(null), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState("");
  const value = controlledValue ?? internalValue;
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState("");
  const [month, setMonth] = useState("");
  const [focused, setFocused] = useState("");
  const [picked, setPicked] = useState("");
  const [time, setTime] = useState("");
  const parsed = draft === null ? value : parseDateInput(draft, locale, type);
  const invalid = parsed === null;
  const validationMessage = invalid ? t(type === "date" ? "Masukkan tanggal yang valid." : "Masukkan tanggal dan waktu yang valid.") : "";
  useEffect(() => {
    field.current?.setCustomValidity(validationMessage);
    if (disabled && popup.current?.matches(":popover-open")) popup.current.hidePopover();
  }, [validationMessage, disabled]);

  const position = useCallback(() => {
    if (!popup.current || !trigger.current) return;
    const anchor = trigger.current.getBoundingClientRect(), panel = popup.current.getBoundingClientRect();
    const left = Math.max(16, Math.min(anchor.right - panel.width, window.innerWidth - panel.width - 16));
    const top = anchor.bottom + 8 + panel.height <= window.innerHeight - 16 ? anchor.bottom + 8 : Math.max(16, anchor.top - panel.height - 8);
    popup.current.style.left = `${left}px`; popup.current.style.top = `${top}px`;
  }, []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
    return () => { window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [open, position]);

  function change(next: string) { setInternalValue(next); onChange?.(next); }
  function commit(next: string) {
    change(next); setDraft(null); field.current?.setCustomValidity("");
    popup.current?.hidePopover(); field.current?.focus({ preventScroll: true });
  }
  function prepare() {
    if (open) return;
    const currentDay = restaurantDate(new Date()), selected = value.slice(0, 10) || currentDay;
    setToday(currentDay); setMonth(`${selected.slice(0, 7)}-01`); setFocused(selected); setPicked(selected); setTime(value.slice(11, 16));
  }
  function moveFocus(date: Date) {
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return;
    const key = date.toISOString().slice(0, 10);
    setMonth(`${key.slice(0, 7)}-01`); setFocused(key);
    requestAnimationFrame(() => popup.current?.querySelector<HTMLButtonElement>(`[data-date="${key}"]`)?.focus({ preventScroll: true }));
  }
  function navigate(event: KeyboardEvent<HTMLTableElement>) {
    const date = new Date(`${focused}T00:00:00Z`), weekday = (date.getUTCDay() + 6) % 7;
    const days: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday };
    if (event.key in days) { event.preventDefault(); date.setUTCDate(date.getUTCDate() + days[event.key]); moveFocus(date); }
    else if (event.key === "PageUp" || event.key === "PageDown") { event.preventDefault(); moveFocus(shiftCalendarMonth(date, (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1))); }
  }
  function choose(key: string) {
    if (type === "date") commit(key);
    else { setPicked(key); setFocused(key); setMonth(`${key.slice(0, 7)}-01`); }
  }
  function changeMonth(offset: number) {
    const date = shiftCalendarMonth(new Date(`${month}T00:00:00Z`), offset).toISOString().slice(0, 10);
    setMonth(date); setFocused(date);
  }
  const language = locale === "en" ? "en-GB" : "id-ID";
  const monthDate = month ? new Date(`${month}T00:00:00Z`) : null;
  const monthLabel = monthDate ? new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate) : "";
  const start = monthDate ? calendarDate(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1 - (monthDate.getUTCDay() + 6) % 7) : null;
  const cells = start ? Array.from({ length: 42 }, (_, index) => calendarDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + index)) : [];
  const fullDate = new Intl.DateTimeFormat(language, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  return <div className="date-field">
    <label htmlFor={id}>{t(label)}</label>
    <div className="date-input-wrap">
      <Input ref={field} id={id} role="combobox" aria-haspopup="dialog" aria-expanded={open} aria-controls={calendarId} aria-autocomplete="none" aria-invalid={invalid || undefined} type="text" required={required} disabled={disabled} autoComplete="off" placeholder={t(type === "date" ? "Pilih tanggal" : "Pilih tanggal dan waktu")} value={draft ?? formatDateInput(value, locale, type)}
        onChange={(event) => { const text = event.target.value, next = parseDateInput(text, locale, type); setDraft(text); event.currentTarget.setCustomValidity(next === null ? t(type === "date" ? "Masukkan tanggal yang valid." : "Masukkan tanggal dan waktu yang valid.") : ""); if (next !== null) change(next); }}
        onBlur={() => { if (!invalid) setDraft(null); }}
        onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); trigger.current?.click(); } }} />
      <button ref={trigger} type="button" className="button icon-button date-trigger" disabled={disabled} popoverTarget={calendarId} aria-label={t("Buka kalender: {0}", { "0": t(label) })} aria-expanded={open} onClick={prepare}><CalendarBlankIcon size={18} aria-hidden="true" /></button>
    </div>
    {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
    <div ref={popup} id={calendarId} className="calendar-popover" popover="auto" role="dialog" aria-label={t("Pilih tanggal: {0}", { "0": t(label) })} aria-describedby={`${id}-help`} onToggle={(event) => {
      const visible = event.newState === "open"; setOpen(visible);
      if (visible) { position(); requestAnimationFrame(() => { position(); popup.current?.querySelector<HTMLButtonElement>("[data-date][tabindex='0']")?.focus({ preventScroll: true }); }); }
    }}>
      <div className="calendar-title"><strong>{t(label)}</strong><Button type="button" className="icon-button" aria-label={t("Tutup kalender")} onClick={() => popup.current?.hidePopover()}><XIcon size={17} aria-hidden="true" /></Button></div>
      <p id={`${id}-help`} className="calendar-help">{t("Gunakan tombol panah untuk memilih hari. Page Up/Down untuk bulan, Shift untuk tahun.")}</p>
      {monthDate && <>
        <div className="calendar-navigation"><Button type="button" className="icon-button" aria-label={t("Bulan sebelumnya")} disabled={month === "0001-01-01"} onClick={() => changeMonth(-1)}><CaretLeftIcon size={17} aria-hidden="true" /></Button><h3 aria-live="polite">{monthLabel}</h3><Button type="button" className="icon-button" aria-label={t("Bulan berikutnya")} disabled={month === "9999-12-01"} onClick={() => changeMonth(1)}><CaretRightIcon size={17} aria-hidden="true" /></Button></div>
        <table className="calendar-grid" role="grid" aria-label={monthLabel} onKeyDown={navigate}>
          <thead><tr>{Array.from({ length: 7 }, (_, index) => <th scope="col" key={index}><abbr title={new Intl.DateTimeFormat(language, { weekday: "long", timeZone: "UTC" }).format(calendarDate(2024, 0, 1 + index))}>{new Intl.DateTimeFormat(language, { weekday: "short", timeZone: "UTC" }).format(calendarDate(2024, 0, 1 + index))}</abbr></th>)}</tr></thead>
          <tbody>{Array.from({ length: 6 }, (_, row) => <tr key={row}>{cells.slice(row * 7, row * 7 + 7).map((date, column) => {
            if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return <td key={column} />;
            const key = date.toISOString().slice(0, 10), selected = type === "date" ? value === key : picked === key;
            return <td key={column} aria-selected={selected}><Button type="button" className={`calendar-day${date.getUTCMonth() !== monthDate.getUTCMonth() ? " outside-month" : ""}`} data-date={key} tabIndex={focused === key ? 0 : -1} aria-label={fullDate.format(date)} aria-current={key === today ? "date" : undefined} onFocus={() => setFocused(key)} onClick={() => choose(key)}>{date.getUTCDate()}</Button></td>;
          })}</tr>)}</tbody>
        </table>
        {type === "datetime-local" && <label className="calendar-time">{t("Waktu (WIB)")}<Input type="time" step={60} disabled={!open} value={time} onChange={(event) => setTime(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (validTime) commit(`${picked}T${time}`); } }} /></label>}
        <div className="calendar-footer"><Button type="button" className="text-button" onClick={() => choose(today)}>{t("Hari ini")}</Button><Button type="button" className="text-button" onClick={() => commit("")}>{t("Kosongkan")}</Button>{type === "datetime-local" && <Button type="button" className="primary-button" disabled={!validTime} onClick={() => commit(`${picked}T${time}`)}>{t("Terapkan")}</Button>}</div>
      </>}
    </div>
  </div>;
}
