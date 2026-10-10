export const RESTAURANT_TIME_ZONE = "Asia/Jakarta";

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
