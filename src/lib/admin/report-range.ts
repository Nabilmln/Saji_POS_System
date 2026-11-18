import { z } from "zod";

export const reportRangeSchema = z.strictObject({
  from: z.iso.date(),
  to: z.iso.date(),
}).refine(({ from, to }) => from <= to && Date.parse(to) - Date.parse(from) < 366 * 86_400_000, {
  message: "Date range must be at most 366 days",
});

export function reportBounds(from: string, to: string): { start: Date; end: Date };
export function reportBounds(from?: string, to?: string): { start: Date | undefined; end: Date | undefined };
export function reportBounds(from?: string, to?: string) {
  return {
    start: from ? new Date(`${from}T00:00:00+07:00`) : undefined,
    end: to ? new Date(Date.parse(`${to}T00:00:00+07:00`) + 86_400_000) : undefined,
  };
}
