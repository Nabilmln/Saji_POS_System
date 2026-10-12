export type RevenuePoint = { date: string; revenueIdr: string; transactionCount: number };

export function revenueDays(from: string, to: string, points: RevenuePoint[]): RevenuePoint[] {
  const byDate = new Map(points.map((point) => [point.date, point]));
  const result: RevenuePoint[] = [];
  for (let day = Date.parse(from); day <= Date.parse(to); day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    result.push(byDate.get(date) ?? { date, revenueIdr: "0", transactionCount: 0 });
  }
  return result;
}
