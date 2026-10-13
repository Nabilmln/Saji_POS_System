"use client";

import { useLocale } from "@/components/locale-provider";

import { StatusBadge } from "@/components/ui/status-badge";

import { Alert, Panel, Button, Input, EmptyState, Pagination } from "@/components/ui/controls";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { usePagination } from "@/lib/use-pagination";

import { useEffect, useState, type FormEvent } from "react";
import { DetailPane } from "@/components/app-shells";
import { Brand } from "@/components/ui/brand";
import Image from "next/image";
import QRCode from "qrcode";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";

type Table = { id: string; tableNumber: string; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; isActive: boolean; orderUrl: string };

export function TableManager() {
  const { t } = useLocale();
  const [tables, setTables] = useState<Table[]>([]);
  const { page, setPage, pageSize, setPageSize } = usePagination();
  const [deleting, setDeleting] = useState<Table | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [number, setNumber] = useState("");
  const [preview, setPreview] = useState<Table | null>(null);
  const [qrSvg, setQrSvg] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = () => setRevision((value) => value + 1);

  useEffect(() => {
    let active = true;
    adminApi<Table[]>("/api/admin/tables")
      .then((data) => { if (active) { setTables(data); setLoading(false); setError(""); } })
      .catch((cause: Error) => { if (active) { setError(cause.message); setLoading(false); } });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    if (!preview) return;
    let active = true;
    const url = new URL(preview.orderUrl, window.location.origin);
    QRCode.toString(url.href, { type: "svg", errorCorrectionLevel: "M", margin: 3, width: 320, color: { dark: "#17212b", light: "#ffffff" } })
      .then((svg) => { if (active) setQrSvg(svg); })
      .catch(() => { if (active) setError("QR tidak dapat dibuat. Coba lagi."); });
    return () => { active = false; };
  }, [preview]);

  function begin(table?: Table) {
    setEditing(table?.id ?? "new"); setNumber(table?.tableNumber ?? ""); setError(""); setFields({}); setNotice("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice(""); setFields({});
    try {
      await adminApi<Table>(editing === "new" ? "/api/admin/tables" : `/api/admin/tables/${editing}`,
        jsonRequest(editing === "new" ? "POST" : "PATCH", { tableNumber: number.trim() }));
      setEditing(null); setNotice("Meja berhasil disimpan."); reload();
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof AdminApiError) setFields(cause.fields ?? {});
    } finally { setBusy(false); }
  }

  async function toggle(table: Table) {
    if (!window.confirm(t("{0} Meja {1}? {2}", { "0": table.isActive ? t("Nonaktifkan") : t("Aktifkan"), "1": table.tableNumber, "2": table.isActive ? t("Kode QR meja tidak akan menerima pesanan baru.") : "" }))) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<Table>(`/api/admin/tables/${table.id}`, jsonRequest("PATCH", { isActive: !table.isActive }));
      setNotice(table.isActive ? `Meja ${table.tableNumber} dinonaktifkan.` : `Meja ${table.tableNumber} diaktifkan.`); reload();
      if (preview?.id === table.id) setPreview(null);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function openQr(table: Table) { setQrSvg(""); setPreview(table); setError(""); }

  async function remove(table: Table) {
    setBusy(true); setNotice(""); setError("");
    try {
      await adminApi(`/api/admin/tables/${table.id}`, { method: "DELETE" });
      if (preview?.id === table.id) setPreview(null);
      if (editing === table.id) setEditing(null);
      setNotice("Meja dihapus. Riwayat transaksi tetap tersimpan."); reload();
    } finally { setBusy(false); }
  }

  const currentPage = Math.min(page, Math.max(1, Math.ceil(tables.length / pageSize)));
  const qrUrl = preview ? new URL(preview.orderUrl, typeof window === "undefined" ? "http://localhost" : window.location.origin).href : "";
  const downloadHref = qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : "";
  return <div className="admin-stack">
    <p className="section-intro">{t("Atur nomor meja dan unduh kode QR unik untuk meja yang aktif.")}</p>
    {notice && <Alert toast className="inline-alert info" role="status">{t(notice)}</Alert>}
    {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>{t("Daftar meja")}</h2></div><Button className="primary-button" disabled={busy} onClick={() => begin()}>{t("Tambah Meja")}</Button></div>
      {editing && <form className="admin-form" onSubmit={save}>
        <div className="admin-section-head"><h3>{editing === "new" ? t("Meja baru") : t("Ubah nomor meja")}</h3><Button className="text-button" type="button" onClick={() => setEditing(null)}>{t("Tutup")}</Button></div>
        <label>{t("Nomor meja *")}<Input className="text-field" required maxLength={30} value={number} onChange={(event) => setNumber(event.target.value)} />{fields.tableNumber && <small className="field-error">{fields.tableNumber.join(", ")}</small>}</label>
        <div className="admin-actions"><Button className="primary-button" disabled={busy}>{busy ? t("Menyimpan…") : t("Simpan Meja")}</Button><Button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(null)}>{t("Batal")}</Button></div>
      </form>}
    </Panel>
    <Panel><h2>{t("Daftar meja")}</h2>
      {loading ? <p className="loading-block" role="status">{t("Memuat meja…")}</p> : !tables.length ? <EmptyState className="empty-state"><h2>{t("Belum ada meja")}</h2><p>{t("Tambahkan meja untuk membuat kode QR.")}</p></EmptyState> : <DataTable caption={t("Daftar meja")} columns={[t("Nomor meja"), t("Status"), t("Pemesanan QR"), t("Tindakan")]}>{tables.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((table) => <tr key={table.id}>
        <th scope="row">{table.tableNumber}</th><td><StatusBadge status={table.status} /></td><td><StatusBadge status={table.isActive ? "ACTIVE" : "INACTIVE"} /></td>
        <td><div className="admin-row-actions">
          <Button className="text-button" disabled={busy || table.status !== "AVAILABLE"} onClick={() => begin(table)}>{t("Ubah nomor")}</Button>
          <Button className="text-button" disabled={busy || table.status !== "AVAILABLE"} onClick={() => void toggle(table)}>{table.isActive ? t("Nonaktifkan") : t("Aktifkan")}</Button>
          {table.isActive && <Button className="text-button" onClick={() => openQr(table)}>{t("Lihat QR")}</Button>}
          <Button className="text-button danger-text" disabled={busy || table.status !== "AVAILABLE"} onClick={() => setDeleting(table)}>{t("Hapus")}</Button>
        </div></td>
      </tr>)}</DataTable>}
    </Panel>
    <Pagination pageSize={pageSize} onPageSizeChange={setPageSize} page={currentPage} hasNext={currentPage * pageSize < tables.length} total={tables.length} onChange={setPage} disabled={busy || loading} />
    {deleting && <ConfirmDelete name={t("Meja {0}", { "0": deleting.tableNumber })} description={t("Meja ini dihapus dari daftar. Kode QR lama berhenti menerima pesanan; riwayat transaksi tetap tersimpan.")} onClose={() => setDeleting(null)} onConfirm={() => remove(deleting)} />}
    {preview && <DetailPane><Panel className="admin-panel qr-section" aria-labelledby="qr-title">
      <div className="admin-section-head"><div><h2 id="qr-title">{t("Meja")}{" "}{preview.tableNumber}</h2></div><Button className="text-button" onClick={() => setPreview(null)}>{t("Tutup")}</Button></div>
      <div className="qr-template">
        <Brand /><h3>{t("Meja")}{" "}{preview.tableNumber}</h3>
        {qrSvg ? <Image unoptimized src={downloadHref} alt={t("Kode QR untuk pemesanan Meja {0}", { "0": preview.tableNumber })} width={280} height={280} /> : <p role="status">{t("Membuat QR…")}</p>}
        <p>{t("Scan untuk memesan")}</p>
      </div>
      <label className="qr-url-label">{t("Tautan tujuan")}<Input className="text-field" readOnly value={qrUrl} onFocus={(event) => event.target.select()} /></label>
      {qrSvg && <a className="primary-button" download={`meja-${preview.tableNumber.replace(/[^A-Za-z0-9_-]/g, "-")}-qr.svg`} href={downloadHref}>{t("Unduh QR (SVG)")}</a>}
    </Panel></DetailPane>}
  </div>;
}
