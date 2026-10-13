export const RESTAURANT_TIME_ZONE = "Asia/Jakarta";

export function formatDate(value: string | Date, locale: "id" | "en", month: "short" | "long" = "short"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    timeZone: RESTAURANT_TIME_ZONE, day: "numeric", month, year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date, locale: "id" | "en"): string {
  const time = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    timeZone: RESTAURANT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(value));
  return `${formatDate(value, locale)} · ${time} WIB`;
}

const restaurantDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: RESTAURANT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function restaurantDate(date: Date): string {
  const parts = Object.fromEntries(
    restaurantDateFormatter.formatToParts(date).map(({ type, value }) => [
      type,
      value,
    ]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
