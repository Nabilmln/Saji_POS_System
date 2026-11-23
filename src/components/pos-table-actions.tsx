"use client";

import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/controls";

export function PosTableActions({
  sessionId,
  reserved,
  busy,
  paymentDisabled,
  addLabel = "Tambah order",
  onAddOrder,
  onReceipt,
  onPayment,
  preferLink = false,
}: {
  sessionId?: string;
  reserved?: boolean;
  busy?: boolean;
  paymentDisabled?: boolean;
  addLabel?: string;
  onAddOrder: () => void;
  onReceipt: () => void;
  onPayment?: (sessionId: string) => void;
  preferLink?: boolean;
}) {
  const { t } = useLocale();
  const disabled = !sessionId || busy || paymentDisabled;

  return (
    <div className="table-quick-actions">
      <Button className="secondary-button" disabled={reserved || busy} onClick={onAddOrder}>
        {t(addLabel)}
      </Button>
      <Button className="secondary-button" disabled={!sessionId || busy} onClick={onReceipt}>
        {t("Lihat struk")}
      </Button>
      {preferLink ? (
        <a
          role="link"
          className={`button primary-button${disabled ? " disabled" : ""}`}
          href={sessionId ? `/pos/payments/${sessionId}` : "#"}
          aria-disabled={disabled}
          onClick={(event) => {
            if (disabled) {
              event.preventDefault();
              return;
            }
            if (onPayment && sessionId) {
              event.preventDefault();
              onPayment(sessionId);
            }
          }}
        >
          {t("Pembayaran")}
        </a>
      ) : (
        <Button
          className="primary-button"
          disabled={disabled}
          onClick={() => sessionId && onPayment?.(sessionId)}
        >
          {t("Pembayaran")}
        </Button>
      )}
    </div>
  );
}
