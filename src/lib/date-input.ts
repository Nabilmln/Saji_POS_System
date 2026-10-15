import { formatDate } from "./time";

export type DateInputType = "date" | "datetime-local";

export function calendarDate(year: number, month: number, day = 1): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date;
}

export function shiftCalendarMonth(date: Date, offset: number): Date {
  const index = Math.max(12, Math.min(9999 * 12 + 11, date.getUTCFullYear() * 12 + date.getUTCMonth() + offset));
  const year = Math.floor(index / 12), month = index % 12;
  return calendarDate(year, month, Math.min(date.getUTCDate(), calendarDate(year, month + 1, 0).getUTCDate()));
}

export function parseDateInput(text: string, locale: "id" | "en", type: DateInputType = "date"): string | null {
  let dateText = text.trim(), time = "";
  if (!dateText) return "";
  if (type === "datetime-local") {
    const parts = dateText.match(/^(.*?)[T,\s]+(\d{1,2}):(\d{2})$/);
    if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59) return null;
    dateText = parts[1].trim();
    time = `T${parts[2].padStart(2, "0")}:${parts[3]}`;
  }
  let year: number, month: number, day: number;
  const iso = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const numeric = dateText.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  const named = dateText.match(/^(\d{1,2})\s+([\p{L}.]+)\s+(\d{1,4})$/u);
  if (iso) [, year, month, day] = iso.map(Number);
  else if (numeric) [, day, month, year] = numeric.map(Number);
  else if (named) {
    day = Number(named[1]); year = Number(named[3]);
    const normalize = (value: string) => value.toLowerCase().replace(/\./g, "");
    const short = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", { month: "short", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", { month: "long", timeZone: "UTC" });
    month = Array.from({ length: 12 }, (_, index) => calendarDate(2024, index)).findIndex((date) => [short.format(date), long.format(date)].some((name) => normalize(name) === normalize(named[2]))) + 1;
  } else return null;
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = calendarDate(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${date.toISOString().slice(0, 10)}${time}`;
}

export function formatDateInput(value: string, locale: "id" | "en", type: DateInputType = "date"): string {
  if (!value) return "";
  return `${formatDate(value.slice(0, 10), locale)}${type === "datetime-local" ? `, ${value.slice(11, 16)}` : ""}`;
}
