"use client";

import { useLocale } from "@/components/locale-provider";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { PasswordInput, Pagination, Panel, Button, Alert, Input } from "@/components/ui/controls";
import { DetailPane } from "@/components/app-shells";

type Staff = { userId: string; displayName: string; role: "ADMIN" | "CASHIER"; isActive: boolean };

export function StaffManager() {
  const { t } = useLocale();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try { setStaff(await adminApi<Staff[]>(`/api/admin/staff?page=${page}&pageSize=20`)); setError(""); }
    catch { setError("Daftar staf belum dapat dimuat. Coba lagi."); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi(editing === "new" ? "/api/admin/staff" : `/api/admin/staff/${editing.userId}`,
        jsonRequest(editing === "new" ? "POST" : "PATCH", editing === "new" ? { email: email.trim(), password, displayName: name.trim(), role: "CASHIER" } : { displayName: name.trim() }));
      await load(); setNotice(editing === "new" ? "Akun Kasir dibuat. Bagikan email dan kata sandi secara pribadi kepada kasir." : "Nama staf diperbarui."); setEditing(null); setPassword("");
    } catch (cause) { setError(cause instanceof AdminApiError && cause.code === "AUTH_CLEANUP_FAILED" ? "Pembuatan akun gagal dan perlu diperiksa oleh administrator Auth sebelum mencoba lagi." : "Akun belum dapat disimpan. Periksa isian dan coba lagi."); }
    finally { setBusy(false); }
  }
  async function toggle(item: Staff) {
    if (!window.confirm(t("{0} akses {1}?", { "0": item.isActive ? t("Nonaktifkan") : t("Aktifkan"), "1": item.displayName }))) return;
    setBusy(true); setError(""); setNotice("");
    try { await adminApi(`/api/admin/staff/${item.userId}`, jsonRequest("PATCH", { isActive: !item.isActive })); await load(); setNotice("Akses staf diperbarui."); }
    catch (cause) { setError(cause instanceof AdminApiError && cause.code === "OWNER_PROTECTED" ? "Akun pemilik tidak dapat dinonaktifkan." : "Akses staf belum dapat diperbarui. Coba lagi."); }
    finally { setBusy(false); }
  }
  return <div className="admin-stack"><Panel className="admin-panel">
    <div className="admin-section-head"><h2>{t("Akun staf")}</h2><Button className="primary-button" disabled={busy} onClick={() => { setEditing("new"); setName(""); setEmail(""); setPassword(""); setError(""); }}>{t("Tambah Kasir")}</Button></div>
    <p className="muted">{t("Buat akun kasir dengan email dan kata sandi. Akun pemilik tetap aktif dan tidak dapat dinonaktifkan.")}</p>
    {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}{notice && <Alert className="inline-alert info" role="status">{t(notice)}</Alert>}
    {editing && <form className="admin-form" onSubmit={save}><h3>{editing === "new" ? t("Kasir baru") : t("Ubah nama staf")}</h3><div className="admin-form-grid"><label>{t("Nama staf")}<Input className="text-field" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>{editing === "new" && <label>{t("Email")}<Input className="text-field" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}{editing === "new" && <label>{t("Kata sandi kasir")}<PasswordInput autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}</div><div className="admin-actions"><Button className="primary-button" disabled={busy}>{busy ? t("Menyimpan…") : t("Simpan staf")}</Button><Button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(null)}>{t("Batal")}</Button></div></form>}
    {loading ? <p className="loading-block" role="status">{t("Memuat staf…")}</p> : staff.length ? <div className="admin-list">{staff.map((item) => <div className="admin-list-row" key={item.userId}><div className="admin-list-main"><strong>{item.displayName}</strong><p>{item.role === "ADMIN" ? t("Admin") : t("Kasir")} · {item.isActive ? t("Aktif") : t("Nonaktif")}</p></div><div className="admin-row-actions"><Button className="text-button" disabled={busy} onClick={() => { setEditing(item); setName(item.displayName); setError(""); }}>{t("Ubah nama")}</Button>{item.role === "CASHIER" ? <Button className={`text-button ${item.isActive ? "danger-text" : ""}`} disabled={busy} onClick={() => void toggle(item)}>{item.isActive ? t("Nonaktifkan") : t("Aktifkan")}</Button> : <span className="protected-label">{t("Pemilik eksklusif")}</span>}</div></div>)}</div> : <p className="empty-state">{t("Tidak ada staf pada halaman ini.")}</p>}
    <Pagination page={page} hasNext={staff.length === 20} onChange={setPage} disabled={busy} />
    <DetailPane><div className="detail-heading"><h2>{t("Akses tim")}</h2></div><p className="muted">{t("Pemilik mengelola akun kasir untuk restoran ini.")}</p><div className="detail-stat"><span>{t("Akun pada halaman ini")}</span><strong>{staff.length}</strong></div><p className="detail-note">{t("Kata sandi tidak dapat dilihat kembali setelah akun dibuat. Bagikan email dan kata sandi secara pribadi kepada kasir.")}</p></DetailPane>
  </Panel></div>;
}
