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

export function revenueInsights(days: RevenuePoint[]) {
  const paidDays = days.filter((day) => day.transactionCount > 0);
  const total = days.reduce((sum, day) => sum + BigInt(day.revenueIdr), 0n);
  const best = paidDays.reduce<RevenuePoint | null>((current, day) =>
    !current || BigInt(day.revenueIdr) > BigInt(current.revenueIdr) ? day : current, null);
  return {
    paidDays: paidDays.length,
    averageDailyIdr: days.length ? total / BigInt(days.length) : 0n,
    best,
    bestSharePercent: best && total > 0n ? Number(BigInt(best.revenueIdr) * 1000n / total) / 10 : null,
  };
}
