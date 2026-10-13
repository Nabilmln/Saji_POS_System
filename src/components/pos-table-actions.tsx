"use client";

import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/controls";

export function PosTableActions({ sessionId, reserved, busy, paymentDisabled, addLabel = "Tambah order", onAddOrder, onReceipt, onPayment }: {
  sessionId?: string; reserved?: boolean; busy?: boolean; paymentDisabled?: boolean; addLabel?: string;
  onAddOrder: () => void; onReceipt: () => void; onPayment?: (sessionId: string) => void;
}) {
  const { t } = useLocale();
  return <div className="table-quick-actions">
    <Button className="secondary-button" disabled={reserved || busy} onClick={onAddOrder}>{t(addLabel)}</Button>
    <Button className="secondary-button" disabled={!sessionId || busy} onClick={onReceipt}>{t("Lihat struk")}</Button>
    {onPayment || !sessionId || busy || paymentDisabled ? <Button className="primary-button" disabled={!sessionId || busy || paymentDisabled} onClick={() => sessionId && onPayment?.(sessionId)}>{t("Pembayaran")}</Button> : <Link className="button primary-button" href={`/pos/payments/${sessionId}`}>{t("Pembayaran")}</Link>}
  </div>;
}
