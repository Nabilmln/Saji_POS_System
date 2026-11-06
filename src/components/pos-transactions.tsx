"use client";

import { DatePicker } from "@/components/ui/date-picker";

import { useLocale } from "@/components/locale-provider";

import { useCallback, useEffect, useState } from "react";
import { DetailPane, HeaderAction } from "@/components/app-shells";
import { SyncStatus } from "@/components/ui/sync-status";
import { usePolling } from "@/lib/use-polling";
import { ReceiptPreview } from "@/components/pos-receipt";
import { Pagination, Panel, Button, Alert, LoadingState } from "@/components/ui/controls";
import { DataTable, TableDateTime, TableAction, TableActions } from "@/components/ui/data-table";
import { usePagination } from "@/lib/use-pagination";
import { adminPage, AdminApiError } from "@/lib/admin/client";


type Transaction = { id: string; tableNumber: string; method: "CASH"; grandTotalIdr: string; cashReceivedIdr: string; changeIdr: string; paidAt: string };


export function PosTransactions({ initialReceiptId = "" }: { initialReceiptId?: string }) {
  const { t, money, locale } = useLocale();
  const [hasNext, setHasNext] = useState(false);
  const [receiptId, setReceiptId] = useState(initialReceiptId);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { page, setPage, pageSize, setPageSize } = usePagination();
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const refresh = useCallback(async () => {
    if (from && to && from > to) { setRows([]); setError("Tanggal awal tidak boleh melewati tanggal akhir."); setLoaded(true); return; }
    if (from && to && Date.parse(to) - Date.parse(from) > 366 * 86_400_000) { setRows([]); setError("Pilih rentang tanggal yang valid, maksimal 366 hari."); setLoaded(true); return; }
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    try { const result = await adminPage<Transaction>(`/api/staff/payments?${query}`); setRows(result.items); setHasNext(result.hasNext); setError(""); setSyncedAt(new Date()); setSyncFailed(false); }
    catch (cause) { setRows([]); setError(cause instanceof AdminApiError && cause.code === "VALIDATION_ERROR" ? "Pilih rentang tanggal yang valid, maksimal 366 hari." : "Riwayat transaksi belum dapat dimuat. Periksa koneksi lalu coba lagi."); setSyncFailed(true); }
    finally { setLoaded(true); }
  }, [from, to, page, pageSize]);
  usePolling(refresh);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);
  return (
    <div className="admin-stack">
      <HeaderAction>
        <SyncStatus syncedAt={syncedAt} syncFailed={syncFailed} />
        <Button className="secondary-button header-action-button" onClick={() => void refresh()}>{t("Segarkan")}</Button>
      </HeaderAction>
      <Panel className="admin-panel">
        <div className="admin-section-head transaction-toolbar">
          <div className="transaction-toolbar-head">
            <h2>{t("Riwayat pembayaran")}</h2>
          </div>
          <div className="transaction-toolbar-dates">
            <DatePicker label="Dari tanggal" value={from} onChange={(value) => { setFrom(value); setPage(1); }} />
            <DatePicker label="Sampai tanggal" value={to} onChange={(value) => { setTo(value); setPage(1); }} />
          </div>
        </div>
        {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
        {!loaded ? (
          <LoadingState variant="table">{t("Memuat transaksi…")}</LoadingState>
        ) : rows.length ? (
          <DataTable revision={JSON.stringify(rows)} caption={t("Daftar transaksi")} columns={[t("Transaksi"), t("Meja"), t("Waktu"), t("Total"), t("Metode"), t("Tindakan")]}>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.id.slice(0, 8)}</th>
                <td>{row.tableNumber}</td>
                <td className="date-cell"><TableDateTime value={row.paidAt} locale={locale} /></td>
                <td className="money-cell">{money(row.grandTotalIdr)}</td>
                <td>{t("Tunai")}</td>
                <td>
                  <TableActions>
                    <TableAction action="receipt" aria-pressed={receiptId === row.id} onClick={() => setReceiptId(row.id)} />
                  </TableActions>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <p className="empty-state">{t("Belum ada transaksi lunas pada rentang ini.")}</p>
        )}
        <Pagination pageSize={pageSize} onPageSizeChange={setPageSize} page={page} hasNext={hasNext} onChange={setPage} />
      </Panel>
      {receiptId && (
        <DetailPane revision={receiptId}>
          <ReceiptPreview key={receiptId} paymentId={receiptId} onClose={() => setReceiptId("")} />
        </DetailPane>
      )}
    </div>
  );
}
