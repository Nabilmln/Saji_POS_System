export function percentToBps(value: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return bps <= 10_000 ? bps : null;
}

export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
