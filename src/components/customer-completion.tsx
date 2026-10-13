"use client";

import { HandWavingIcon, QrCodeIcon } from "@phosphor-icons/react";
import { useLocale } from "@/components/locale-provider";
import { Panel } from "@/components/ui/controls";
import { StatusBadge } from "@/components/ui/status-badge";

export function CustomerCompletion({ paid, customerName }: { paid: boolean; customerName: string }) {
  const { t } = useLocale();
  return <Panel className="customer-completion" aria-live="polite">
    <div className="completion-top"><span className="completion-wave"><HandWavingIcon size={32} weight="duotone" aria-hidden="true" /></span>{paid && <StatusBadge status="PAID" />}</div>
    <h1>{paid ? t("Terima kasih, {0}!", { "0": customerName }) : t("Sesi pemesanan telah berakhir.")}</h1>
    <p className="completion-confirmation">{paid ? t("Pembayaran telah dikonfirmasi kasir.") : t("Sesi ini ditutup tanpa pembayaran.")}</p>
    <p>{t("Senang menyambut Anda di sini. Sampai jumpa lagi!")}</p>
    <div className="completion-next-visit"><QrCodeIcon size={22} aria-hidden="true" /><p>{t("Ingin memesan lagi? Pindai ulang QR di meja untuk memulai sesi baru.")}</p></div>
  </Panel>;
}
