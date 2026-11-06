"use client";

import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useLocale } from "@/components/locale-provider";

export function SyncStatus({ syncedAt, syncFailed }: { syncedAt: Date | null; syncFailed: boolean }) {
  const { t } = useLocale();
  return (
    <div className="pos-sync-status header-sync-status" title={t("Diperbarui otomatis setiap 5 detik saat tab aktif.")}>
      <ArrowsClockwiseIcon size={15} aria-hidden="true" />
      <span title={syncFailed ? t("Belum tersinkron") : syncedAt ? t("Tersinkron") : t("Menunggu data…")}>
        {syncFailed ? t("Belum tersinkron") : syncedAt ? t("Tersinkron") : t("Menunggu data…")}
      </span>
      {syncedAt && (
        <time dateTime={syncedAt.toISOString()}>
          {syncedAt.toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta", hour12: false })}
        </time>
      )}
    </div>
  );
}
