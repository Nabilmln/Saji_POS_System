"use client";

import { Text, useLocale } from "@/components/locale-provider";
import { useNotice, statusNotice } from "@/components/ui/notice";
import { useConfirmation } from "@/components/ui/confirmation";

import { StatusBadge } from "@/components/ui/status-badge";

import { Alert, Panel, Button, Input, EmptyState, Pagination, LoadingState } from "@/components/ui/controls";
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
  const setNotice = useNotice();
  const confirm = useConfirmation();
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
      setEditing(null); setNotice({ text: "Meja berhasil disimpan.", subject: <Text value={`Meja ${number.trim()}`} /> }); reload();
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof AdminApiError) setFields(cause.fields ?? {});
    } finally { setBusy(false); }
  }

  async function toggle(table: Table) {
    if (!await confirm({ title: table.isActive ? "Nonaktifkan meja?" : "Aktifkan meja?", subject: <Text value={`Meja ${table.tableNumber}`} />, description: table.isActive ? "Kode QR meja tidak akan menerima pesanan baru." : "Pelanggan dapat memesan melalui kode QR meja ini.", confirmLabel: table.isActive ? "Nonaktifkan" : "Aktifkan" })) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<Table>(`/api/admin/tables/${table.id}`, jsonRequest("PATCH", { isActive: !table.isActive }));
      setNotice(statusNotice(<Text value={`Meja ${table.tableNumber}`} />, table.isActive ? "Nonaktif" : "Aktif")); reload();
      if (preview?.id === table.id) setPreview(null);
    } catch (cause) { setError((cause as Error).message); setNotice({ text: "Status {0} belum dapat diperbarui.", values: { 0: <Text value={`Meja ${table.tableNumber}`} /> }, tone: "error" }); }
    finally { setBusy(false); }
  }

  function openQr(table: Table) { setQrSvg(""); setPreview(table); setError(""); }

  async function remove(table: Table) {
    setBusy(true); setNotice(""); setError("");
    try {
      await adminApi(`/api/admin/tables/${table.id}`, { method: "DELETE" });
      if (preview?.id === table.id) setPreview(null);
      if (editing === table.id) setEditing(null);
      setNotice({ text: "Meja dihapus. Riwayat transaksi tetap tersimpan.", subject: <Text value={`Meja ${table.tableNumber}`} /> }); reload();
    } finally { setBusy(false); }
  }

  const currentPage = Math.min(page, Math.max(1, Math.ceil(tables.length / pageSize)));
  const qrUrl = preview ? new URL(preview.orderUrl, typeof window === "undefined" ? "http://localhost" : window.location.origin).href : "";
  const downloadHref = qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : "";
  return <div className="admin-stack">
    <p className="section-intro">{t("Atur nomor meja dan unduh kode QR unik untuk meja yang aktif.")}</p>

    {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>{t("Daftar meja")}</h2></div><Button className="primary-button" disabled={busy} onClick={() => begin()}>{t("Tambah Meja")}</Button></div>
      {editing && <form className="admin-form" onSubmit={save}>
        <div className="admin-section-head"><h3>{editing === "new" ? t("Meja baru") : t("Ubah nomor meja")}</h3><Button className="text-button" type="button" onClick={() => setEditing(null)}>{t("Tutup")}</Button></div>
        <label>{t("Nomor meja *")}<Input className="text-field" required maxLength={30} value={number} onChange={(event) => setNumber(event.target.value)} />{fields.tableNumber && <small className="field-error">{fields.tableNumber.join(", ")}</small>}</label>
        <div className="admin-actions"><Button className="primary-button" disabled={busy}>{busy ? t("Menyimpan…") : t("Simpan Meja")}</Button><Button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(null)}>{t("Batal")}</Button></div>
      </form>}
    </Panel>
    <section className="admin-table-list" aria-label={t("Daftar meja")}>
      {loading ? <LoadingState variant="cards">{t("Memuat meja…")}</LoadingState> : !tables.length ? <EmptyState className="empty-state"><h2>{t("Belum ada meja")}</h2><p>{t("Tambahkan meja untuk membuat kode QR.")}</p></EmptyState> : <div className="admin-table-grid">{tables.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((table) => <article className={`admin-table-card${preview?.id === table.id ? " selected" : ""}`} aria-labelledby={`admin-table-${table.id}`} key={table.id}>
        <div className="admin-table-heading"><h3 id={`admin-table-${table.id}`}>{t("Meja {0}", { "0": table.tableNumber })}</h3><StatusBadge status={table.status} /></div>
        <div className="admin-table-qr"><span>{t("Pemesanan QR")}</span><StatusBadge status={table.isActive ? "ACTIVE" : "INACTIVE"} /></div>
        <div className="admin-table-actions">
          <Button className="secondary-button" disabled={busy || !table.isActive} aria-pressed={preview?.id === table.id} onClick={() => openQr(table)}>{t("Lihat QR")}</Button>
          <Button className="text-button" disabled={busy || table.status !== "AVAILABLE"} onClick={() => begin(table)}>{t("Ubah nomor")}</Button>
          <Button className="text-button" disabled={busy || table.status !== "AVAILABLE"} onClick={() => void toggle(table)}>{table.isActive ? t("Nonaktifkan") : t("Aktifkan")}</Button>
          <Button className="text-button danger-text" disabled={busy || table.status !== "AVAILABLE"} onClick={() => setDeleting(table)}>{t("Hapus")}</Button>
        </div>
      </article>)}</div>}
    </section>
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
