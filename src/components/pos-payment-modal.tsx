"use client";

import { useLocale, Text } from "@/components/locale-provider";
import { useNotice, statusNotice } from "@/components/ui/notice";
import { Alert, Button, EmptyState, Input, LoadingState } from "@/components/ui/controls";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { BillBreakdown } from "@/components/pos-bill";
import { usePolling } from "@/lib/use-polling";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { canSubmitPayment, cashChange, quoteChanged, type BillQuote } from "@/lib/staff/payment-ui";
import { randomId } from "@/lib/random-id";
import type { StaffOrder } from "@/components/order-details";
import { CheckCircleIcon, XIcon, ReceiptIcon } from "@phosphor-icons/react";
import "./pos-payment-modal.css";

type TableDetail = {
  id: string;
  tableNumber: string;
  session: { id: string; billRevision: string } | null;
  orders: StaffOrder[];
};

type Payload = {
  idempotencyKey: string;
  expectedSessionRevision: string;
  expectedSettingsVersion: string;
  cashReceivedIdr: string;
};

type Payment = {
  paymentId: string;
  changeIdr: string;
  grandTotalIdr: string;
  cashReceivedIdr: string;
  paidAt: string;
  receiptUrl: string;
};

export function PosPaymentModal({
  sessionId,
  onClose,
  onViewReceipt,
}: {
  sessionId: string;
  onClose: () => void;
  onViewReceipt?: (paymentId: string) => void;
}) {
  const { t, money } = useLocale();
  const [quote, setQuote] = useState<BillQuote | null>(null);
  const [table, setTable] = useState<TableDetail | null>(null);
  const [cash, setCash] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");
  const setNotice = useNotice();
  const [loaded, setLoaded] = useState(false);
  const current = useRef<BillQuote | null>(null);
  const paymentInFlight = useRef(false);
  const pendingKey = `pos-payment:${sessionId}`;

  const refresh = useCallback(
    async (force = false) => {
      if ((paymentInFlight.current && !force) || payment) return;
      try {
        const nextQuote = await adminApi<BillQuote>(`/api/staff/table-sessions/${sessionId}/bill`);
        const nextTable = await adminApi<TableDetail>(`/api/staff/tables/${nextQuote.tableId}`);
        if (current.current && quoteChanged(current.current, nextQuote)) {
          setReviewed(false);
          setConfirming(false);
          setNotice({
            text: "Tagihan diperbarui. Periksa total terbaru sebelum pembayaran.",
            subject: <Text value={`Meja ${nextQuote.tableNumber}`} />,
            tone: "warning",
          });
        }
        current.current = nextQuote;
        setQuote(nextQuote);
        setTable(
          nextTable.session?.id === sessionId &&
            nextTable.session.billRevision === nextQuote.sessionRevision
            ? nextTable
            : null
        );
        setError("");
      } catch (cause) {
        setError(
          cause instanceof AdminApiError && cause.code === "SESSION_NOT_ACTIVE"
            ? "Sesi sudah ditutup. Periksa riwayat transaksi."
            : "Tagihan belum tersinkron. Segarkan sebelum membayar."
        );
        setReviewed(false);
        setConfirming(false);
      } finally {
        setLoaded(true);
      }
    },
    [sessionId, payment, setNotice]
  );

  usePolling(refresh);

  // Restore pending payment from sessionStorage
  useEffect(() => {
    const initial = window.setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(pendingKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Payload;
          if (
            parsed.idempotencyKey &&
            parsed.expectedSessionRevision &&
            parsed.expectedSettingsVersion &&
            parsed.cashReceivedIdr
          ) {
            setPending(parsed);
            setCash(parsed.cashReceivedIdr);
            setNotice({
              text: "Status pembayaran belum pasti. Ulangi dengan kunci transaksi yang sama atau periksa riwayat.",
              tone: "warning",
            });
          }
        }
      } catch {
        sessionStorage.removeItem(pendingKey);
      }
    }, 0);
    return () => window.clearTimeout(initial);
  }, [pendingKey, setNotice]);

  async function sendPayment(payload: Payload) {
    if (paymentInFlight.current) return;
    paymentInFlight.current = true;
    setBusy(true);
    setError("");
    setConfirming(false);

    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(payload));
    } catch {
      paymentInFlight.current = false;
      setBusy(false);
      setError("Penyimpanan tab tidak tersedia. Aktifkan penyimpanan browser sebelum membayar.");
      return;
    }

    setPending(payload);

    try {
      const result = await adminApi<Payment>(`/api/staff/table-sessions/${sessionId}/payments`, {
        ...jsonRequest("POST", payload),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": payload.idempotencyKey,
        },
      });
      try {
        sessionStorage.removeItem(pendingKey);
      } catch {
        /* Payment already confirmed */
      }
      setPending(null);
      setPayment(result);
      setNotice(
        statusNotice(
          quote ? <Text value={`Meja ${quote.tableNumber}`} /> : <Text value="Pembayaran" />,
          "Lunas"
        )
      );
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "BILL_CHANGED") {
        sessionStorage.removeItem(pendingKey);
        setPending(null);
        setReviewed(false);
        await refresh(true);
        setNotice({
          text: "Tagihan berubah. Periksa total terbaru dan konfirmasi ulang.",
          tone: "warning",
        });
      } else if (
        cause instanceof AdminApiError &&
        ["CASH_INSUFFICIENT", "ORDERS_NOT_SERVED", "VALIDATION_ERROR"].includes(cause.code)
      ) {
        sessionStorage.removeItem(pendingKey);
        setPending(null);
        setReviewed(false);
        await refresh(true);
        setError("Pembayaran ditolak. Segarkan tagihan dan periksa uang serta status pesanan.");
      } else if (
        cause instanceof AdminApiError &&
        ["PAYMENT_ALREADY_RECORDED", "SESSION_NOT_ACTIVE"].includes(cause.code)
      ) {
        sessionStorage.removeItem(pendingKey);
        setPending(null);
        setError("Sesi ini sudah ditutup. Periksa riwayat transaksi sebelum melakukan pembayaran lain.");
      } else {
        setError(
          "Hasil pembayaran belum pasti. Jangan membuat pembayaran baru; ulangi transaksi ini atau periksa riwayat."
        );
      }
    } finally {
      paymentInFlight.current = false;
      setBusy(false);
    }
  }

  async function updateOrder(path: string, method: "POST" | "PATCH", body: object) {
    if (busy || pending || paymentInFlight.current) return;
    setBusy(true);
    setReviewed(false);
    setConfirming(false);
    setError("");
    try {
      await adminApi(path, jsonRequest(method, body));
      const id = path.split("/").at(-2)!;
      const item = table?.orders.flatMap((order) => order.items).find((entry) => entry.id === id);
      setNotice(
        statusNotice(
          method === "POST" ? (
            <Text value={`Pesanan ${id.slice(0, 8)}`} />
          ) : (
            item?.menuName ?? <Text value="Item" />
          ),
          method === "POST" ? "Sedang disiapkan" : "Sudah disajikan"
        )
      );
      await refresh(true);
    } catch {
      await refresh(true);
      setError("Perubahan gagal. Segarkan data dan coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const change = cashChange(quote, cash);
  const ready = canSubmitPayment(quote, cash, reviewed) && !pending && !busy && !error && !!table;

  // Compute smart quick-cash preset buttons
  const grandTotalBig = quote ? BigInt(quote.grandTotalIdr) : 0n;
  const presets: bigint[] = [];
  if (grandTotalBig > 0n) {
    presets.push(grandTotalBig); // Uang pas
    const commonValues = [10_000n, 20_000n, 50_000n, 100_000n, 200_000n, 500_000n];
    for (const val of commonValues) {
      if (val > grandTotalBig && !presets.includes(val)) {
        presets.push(val);
      }
    }
    // Round up to nearest 50,000 if not included
    const nearest50k = ((grandTotalBig + 49_999n) / 50_000n) * 50_000n;
    if (nearest50k > grandTotalBig && !presets.includes(nearest50k)) {
      presets.push(nearest50k);
    }
    presets.sort((a, b) => (a < b ? -1 : 1));
  }

  function handleClose() {
    if (busy) return;
    onClose();
  }

  return (
    <ConfirmationDialog
      titleId="pos-payment-modal-title"
      busy={busy}
      onClose={handleClose}
      className="pos-payment-modal-dialog"
      modal={false}
    >
      <div className="pos-payment-modal">
        {/* Header */}
        <header className="pos-payment-modal-header">
          <div className="pos-payment-modal-title-wrap">
            {quote && (
              <span className="pos-payment-table-pill">
                {t("Meja {0}", { "0": quote.tableNumber })}
              </span>
            )}
            <h2 id="pos-payment-modal-title">
              {payment ? t("Pembayaran Berhasil") : t("Pembayaran Tunai")}
            </h2>
          </div>
          <Button
            type="button"
            className="text-button pos-payment-close-btn"
            onClick={handleClose}
            aria-label={t("Tutup")}
          >
            <XIcon size={18} weight="bold" />
          </Button>
        </header>

        {/* Content Body */}
        {!loaded ? (
          <div style={{ padding: "40px", textAlign: "center" }}>
            <LoadingState>{t("Memuat tagihan…")}</LoadingState>
          </div>
        ) : payment ? (
          /* Success Screen */
          <div className="pos-payment-success-card" role="status">
            <div className="pos-payment-success-icon">
              <CheckCircleIcon size={32} weight="bold" />
            </div>
            <p className="context-label">{t("LUNAS")}</p>
            <h2>{t("Pembayaran berhasil")}</h2>
            <div className="pos-payment-success-meta">
              <p>
                {t("Total")}: <strong>{money(payment.grandTotalIdr)}</strong> · {t("Tunai")}:{" "}
                <strong>{money(payment.cashReceivedIdr)}</strong> · {t("Kembalian")}:{" "}
                <strong>{money(payment.changeIdr)}</strong>
              </p>
              <small className="muted" style={{ display: "block", marginTop: "6px" }}>
                {t("Meja kembali tersedia setelah pembayaran dikonfirmasi server.")}
              </small>
            </div>
            <div className="pos-payment-success-actions">
              {onViewReceipt ? (
                <Button className="primary-button" onClick={() => onViewReceipt(payment.paymentId)}>
                  <ReceiptIcon size={16} />
                  {t("Lihat struk digital")}
                </Button>
              ) : (
                <Link className="button primary-button" href={payment.receiptUrl}>
                  <ReceiptIcon size={16} />
                  {t("Lihat struk digital")}
                </Link>
              )}
              <Button type="button" className="secondary-button" onClick={handleClose}>
                {t("Kembali ke meja")}
              </Button>
            </div>
          </div>
        ) : confirming && quote ? (
          /* Confirmation Step Screen */
          <div className="pos-payment-confirm-card">
            <h2 id="payment-confirm-title">{t("Konfirmasi pembayaran tunai")}</h2>
            <div className="pos-payment-confirm-meta">
              <p>
                {t("Meja")} {quote.tableNumber} · {t("Tagihan")}{" "}
                <strong>{money(quote.grandTotalIdr)}</strong>
              </p>
              <p>
                {t("Uang diterima")} <strong>{money(cash)}</strong> · {t("Kembalian")}{" "}
                <strong style={{ color: "var(--success, #16a34a)" }}>
                  {money(change ?? 0n)}
                </strong>
              </p>
              <p className="muted">
                {t("Pembayaran akan menutup sesi dan mengembalikan meja ke status Tersedia.")}
              </p>
            </div>
            <div className="admin-actions">
              <Button
                type="button"
                className="secondary-button"
                onClick={() => setConfirming(false)}
              >
                {t("Periksa lagi")}
              </Button>
              <Button
                type="button"
                className="primary-button"
                disabled={!ready}
                onClick={() =>
                  void sendPayment({
                    idempotencyKey: randomId(),
                    expectedSessionRevision: quote.sessionRevision,
                    expectedSettingsVersion: quote.settingsVersion,
                    cashReceivedIdr: cash,
                  })
                }
              >
                {t("Bayar tunai")}
              </Button>
            </div>
          </div>
        ) : !quote ? (
          /* Empty / Closed Session */
          <div style={{ padding: "30px" }}>
            <EmptyState className="empty-state">
              <p>{t("Tagihan tidak tersedia.")}</p>
              {pending && (
                <Button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void sendPayment(pending)}
                >
                  {busy ? t("Memeriksa pembayaran…") : t("Ulangi transaksi yang sama")}
                </Button>
              )}
              <Link href="/pos/transactions">{t("Lihat riwayat transaksi")}</Link>
            </EmptyState>
          </div>
        ) : (
          /* Normal Payment 2-Column Split Body */
          <div className="pos-payment-modal-body">
            {/* Left Column: Bill Summary & Items */}
            <div className="pos-payment-bill-col">
              <div className="pos-payment-grand-total-card">
                <span>{t("Total tagihan")}</span>
                <strong>{money(quote.grandTotalIdr)}</strong>
              </div>

              {!quote.paymentEligible && (
                <Alert className="inline-alert info">
                  {quote.blockingOrders.length
                    ? t(
                        "{0} pesanan belum tersaji seluruhnya. Gunakan tombol Tersaji di panel rincian.",
                        { "0": quote.blockingOrders.length }
                      )
                    : t("Belum ada item aktif untuk dibayar.")}
                </Alert>
              )}

              {table && table.orders.length > 0 && (
                <div>
                  <h3 className="pos-payment-section-title">{t("Pesanan Meja")}</h3>
                  <div className="pos-payment-order-items">
                    {table.orders.map((order) => (
                      <div key={order.id} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {order.status === "PENDING" && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "var(--surface)", borderRadius: "6px", border: "1px solid var(--border)" }}>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Order #{order.id.slice(0, 6)} (Menunggu)</span>
                            <Button
                              type="button"
                              className="text-button"
                              style={{ fontSize: "11px" }}
                              disabled={busy || !!pending}
                              onClick={() => void updateOrder(`/api/staff/orders/${order.id}/confirm`, "POST", {})}
                            >
                              {t("Konfirmasi")}
                            </Button>
                          </div>
                        )}
                        {order.items.map((item) => (
                          <div key={item.id} className="pos-payment-order-row">
                            <div className="pos-payment-order-row-info">
                              <strong>
                                {item.quantity}× {item.menuName}
                              </strong>
                              <small>{item.unitPriceIdr ? money(item.unitPriceIdr) : ""}</small>
                            </div>
                            <div className="pos-payment-order-row-status">
                              {!item.served && (
                                <Button
                                  type="button"
                                  className="text-button"
                                  style={{ fontSize: "11px" }}
                                  disabled={busy || !!pending}
                                  aria-label={t("Tersaji: {0} x{1}", { "0": item.menuName, "1": item.quantity })}
                                  onClick={() =>
                                    void updateOrder(`/api/staff/order-items/${item.id}/served`, "PATCH", {
                                      served: true,
                                    })
                                  }
                                >
                                  {t("Tersaji")}
                                </Button>
                              )}
                              <span>{money(item.lineTotalIdr)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="pos-payment-section-title">{t("Rincian Biaya")}</h3>
                <BillBreakdown quote={quote} />
              </div>
            </div>

            {/* Right Column: Cash Entry Form */}
            <div className="pos-payment-form-col">
              {error && (
                <Alert className="inline-alert error" role="alert">
                  {t(error)}{" "}
                  {pending && <Link href="/pos/transactions">{t("Periksa riwayat")}</Link>}
                </Alert>
              )}

              <fieldset className="payment-entry">
                <legend>{t("Pembayaran tunai")}</legend>

                <div className="pos-payment-cash-input-wrap">
                  <label className="field-label" htmlFor="cash-received">
                    {t("Uang diterima (Rp)")}
                  </label>
                  <Input
                    className="text-field pos-payment-cash-input"
                    id="cash-received"
                    inputMode="numeric"
                    autoComplete="off"
                    value={cash}
                    disabled={Boolean(pending) || busy}
                    maxLength={16}
                    onChange={(event) => {
                      setCash(event.target.value.replace(/\D/g, ""));
                      setConfirming(false);
                    }}
                    placeholder={t("Contoh: 200000")}
                  />
                  {presets.length > 0 && (
                    <div className="pos-payment-quick-cash">
                      <button
                        type="button"
                        className="pos-payment-preset-btn"
                        onClick={() => {
                          setCash(quote.grandTotalIdr);
                          setConfirming(false);
                        }}
                      >
                        {t("Uang Pas")}
                      </button>
                      {presets.slice(1, 4).map((p) => (
                        <button
                          key={p.toString()}
                          type="button"
                          className="pos-payment-preset-btn"
                          onClick={() => {
                            setCash(p.toString());
                            setConfirming(false);
                          }}
                        >
                          {money(p)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pos-payment-change-box">
                  <span>{t("Kembalian:")}</span>
                  <strong className={change !== null && change >= 0n ? "positive" : ""}>
                    {money(change ?? 0n)}
                  </strong>
                </div>
                {cash && change === null && (
                  <small style={{ color: "var(--danger, #dc2626)", fontSize: "11px" }}>
                    {t("Uang diterima belum cukup atau tidak valid.")}
                  </small>
                )}

                <label className="check-row">
                  <Input
                    type="checkbox"
                    checked={reviewed}
                    disabled={Boolean(pending) || busy || !quote.paymentEligible || !table || Boolean(error)}
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  {t("Saya sudah memeriksa tagihan terbaru dan uang diterima")}
                </label>

                <div className="admin-actions">
                  <Button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={handleClose}
                  >
                    {t("Batal")}
                  </Button>
                  {pending ? (
                    <Button
                      type="button"
                      className="primary-button"
                      disabled={busy}
                      onClick={() => void sendPayment(pending)}
                    >
                      {busy ? t("Memeriksa pembayaran…") : t("Ulangi transaksi yang sama")}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="primary-button"
                      disabled={!ready}
                      onClick={() => setConfirming(true)}
                    >
                      {t("Konfirmasi pembayaran")}
                    </Button>
                  )}
                </div>
              </fieldset>
            </div>
          </div>
        )}
      </div>
    </ConfirmationDialog>
  );
}
