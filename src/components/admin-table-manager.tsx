"use client";

import { StatusBadge } from "@/components/ui/status-badge";

import { Alert, Panel, Button, Input, EmptyState } from "@/components/ui/controls";

import { useEffect, useState, type FormEvent } from "react";
import { DetailPane } from "@/components/app-shells";
import { Brand } from "@/components/ui/brand";
import Image from "next/image";
import QRCode from "qrcode";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";

type Table = { id: string; tableNumber: string; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; isActive: boolean; orderUrl: string };

export function TableManager() {
  const [tables, setTables] = useState<Table[]>([]);
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
    event.preventDefault(); setBusy(true); setError(""); setFields({});
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
    if (!window.confirm(`${table.isActive ? "Nonaktifkan" : "Aktifkan"} Meja ${table.tableNumber}? ${table.isActive ? "Kode QR meja tidak akan menerima pesanan baru." : ""}`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi<Table>(`/api/admin/tables/${table.id}`, jsonRequest("PATCH", { isActive: !table.isActive }));
      setNotice(`Meja ${table.tableNumber} ${table.isActive ? "dinonaktifkan" : "diaktifkan"}.`); reload();
      if (preview?.id === table.id) setPreview(null);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function openQr(table: Table) { setQrSvg(""); setPreview(table); setError(""); }

  const qrUrl = preview ? new URL(preview.orderUrl, typeof window === "undefined" ? "http://localhost" : window.location.origin).href : "";
  const downloadHref = qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : "";
  return <div className="admin-stack">
    <p className="section-intro">Atur nomor meja dan unduh kode QR unik untuk meja yang aktif.</p>
    {notice && <Alert className="inline-alert info" role="status">{notice}</Alert>}
    {error && <Alert className="inline-alert" role="alert">{error}</Alert>}
    <Panel className="admin-panel">
      <div className="admin-section-head"><div><h2>Daftar meja</h2></div><Button className="primary-button" disabled={busy} onClick={() => begin()}>Tambah Meja</Button></div>
      {editing && <form className="admin-form" onSubmit={save}>
        <div className="admin-section-head"><h3>{editing === "new" ? "Meja baru" : "Ubah nomor meja"}</h3><Button className="text-button" type="button" onClick={() => setEditing(null)}>Tutup</Button></div>
        <label>Nomor meja *<Input className="text-field" required maxLength={30} value={number} onChange={(event) => setNumber(event.target.value)} />{fields.tableNumber && <small className="field-error">{fields.tableNumber.join(", ")}</small>}</label>
        <div className="admin-actions"><Button className="primary-button" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Meja"}</Button><Button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(null)}>Batal</Button></div>
      </form>}
      {loading ? <p className="loading-block" role="status">Memuat meja…</p> : !tables.length ? <EmptyState className="empty-state"><h2>Belum ada meja</h2><p>Tambahkan meja untuk membuat kode QR.</p></EmptyState> : <div className="admin-table-grid">{tables.map((table) => <article className="admin-table-card" key={table.id}>
        <div className="admin-section-head"><div><p className="context-label">MEJA</p><h3>{table.tableNumber}</h3></div><StatusBadge status={table.isActive ? table.status : "INACTIVE"} /></div>
        <p className="muted">{table.status === "AVAILABLE" ? "Siap untuk pemesanan" : table.status === "OCCUPIED" ? "Sedang digunakan" : "Menunggu check-in kasir"}</p>
        <div className="admin-row-actions">
          <Button className="text-button" disabled={busy || table.status !== "AVAILABLE"} onClick={() => begin(table)}>Ubah nomor</Button>
          <Button className="text-button" disabled={busy || table.status !== "AVAILABLE"} onClick={() => void toggle(table)}>{table.isActive ? "Nonaktifkan" : "Aktifkan"}</Button>
          {table.isActive && <Button className="text-button" onClick={() => openQr(table)}>Lihat QR</Button>}
        </div>
      </article>)}</div>}
    </Panel>
    {preview && <DetailPane><Panel className="admin-panel qr-section" aria-labelledby="qr-title">
      <div className="admin-section-head"><div><h2 id="qr-title">Meja {preview.tableNumber}</h2></div><Button className="text-button" onClick={() => setPreview(null)}>Tutup</Button></div>
      <div className="qr-template">
        <Brand /><h3>Meja {preview.tableNumber}</h3>
        {qrSvg ? <Image unoptimized src={downloadHref} alt={`Kode QR untuk pemesanan Meja ${preview.tableNumber}`} width={280} height={280} /> : <p role="status">Membuat QR…</p>}
        <p>Scan untuk memesan</p>
      </div>
      <label className="qr-url-label">Tautan tujuan<Input className="text-field" readOnly value={qrUrl} onFocus={(event) => event.target.select()} /></label>
      {qrSvg && <a className="primary-button" download={`meja-${preview.tableNumber.replace(/[^A-Za-z0-9_-]/g, "-")}-qr.svg`} href={downloadHref}>Unduh QR (SVG)</a>}
    </Panel></DetailPane>}
  </div>;
}
