"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";

export const statusLabels = { AVAILABLE: "Tersedia", OCCUPIED: "Terisi", RESERVED: "Direservasi", PENDING: "Menunggu konfirmasi", PREPARING: "Sedang disiapkan", SERVED: "Sudah disajikan", PAID: "Lunas", VOID: "Dibatalkan", ACTIVE: "Aktif", INACTIVE: "Nonaktif" };
export const orderStatusOptions = [{ value: "PENDING", label: "Menunggu" }, { value: "PREPARING", label: "Disiapkan" }, { value: "SERVED", label: "Tersaji" }];

export function StatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  const { t } = useLocale();
  return <span className={`status-chip ${status.toLowerCase()}`}>{children ?? t(statusLabels[status as keyof typeof statusLabels] ?? status)}</span>;
}
