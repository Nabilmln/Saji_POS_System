"use client";

import { useLocale } from "@/components/locale-provider";
import { useNotice, statusNotice } from "@/components/ui/notice";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, adminPage, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { usePagination } from "@/lib/use-pagination";
import { formatDate } from "@/lib/time";
import { PasswordInput, Pagination, Panel, Button, Alert, Input, LoadingState } from "@/components/ui/controls";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDelete } from "@/components/ui/confirm-delete";
import { StatusBadge } from "@/components/ui/status-badge";
import { DetailPane } from "@/components/app-shells";

type Staff = { userId: string; email: string | null; displayName: string; role: "ADMIN" | "CASHIER"; isActive: boolean; createdAt: string };

export function StaffManager() {
  const { t, locale } = useLocale();
  const [staff, setStaff] = useState<Staff[]>([]);
  const { page, setPage, pageSize, setPageSize } = usePagination();
  const [hasNext, setHasNext] = useState(false);
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [passwordEditing, setPasswordEditing] = useState(false);
  const [deleting, setDeleting] = useState<Staff | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const setNotice = useNotice();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await adminPage<Staff>(`/api/admin/staff?page=${page}&pageSize=${pageSize}`);
      setStaff(result.items); setHasNext(result.hasNext); setError("");
    } catch { setError("Daftar staf belum dapat dimuat. Coba lagi."); }
    finally { setLoading(false); }
  }, [page, pageSize]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  function begin(item: Staff | "new", resetPassword = false) {
    setEditing(item); setPasswordEditing(resetPassword); setPassword(""); setCredentials(null); setError("");
    setName(item === "new" ? "" : item.displayName); setEmail(item === "new" ? "" : item.email ?? "");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (passwordEditing && editing !== "new") {
        await adminApi(`/api/admin/staff/${editing.userId}/password`, jsonRequest("POST", { password }));
        setCredentials({ email, password }); setNotice({ text: "Kata sandi kasir diperbarui. Kasir harus masuk kembali.", subject: name });
      } else {
        await adminApi(editing === "new" ? "/api/admin/staff" : `/api/admin/staff/${editing.userId}`,
          jsonRequest(editing === "new" ? "POST" : "PATCH", editing === "new" ? { email: email.trim(), password, displayName: name.trim(), role: "CASHIER" } : { displayName: name.trim() }));
        if (editing === "new") setCredentials({ email: email.trim(), password });
        setNotice({ text: editing === "new" ? "Akun Kasir dibuat. Bagikan email dan kata sandi secara pribadi kepada kasir." : "Nama staf diperbarui.", subject: name.trim() });
      }
      setEditing(null); setPassword(""); await load();
    } catch (cause) { setError(cause instanceof AdminApiError && cause.code === "AUTH_CLEANUP_FAILED" ? "Pembuatan akun gagal dan perlu diperiksa oleh administrator Auth sebelum mencoba lagi." : cause instanceof AdminApiError ? cause.message : "Akun belum dapat disimpan. Periksa isian dan coba lagi."); }
    finally { setBusy(false); }
  }
  async function toggle(item: Staff) {
    if (!window.confirm(t("{0} akses {1}?", { "0": item.isActive ? t("Nonaktifkan") : t("Aktifkan"), "1": item.displayName }))) return;
    setBusy(true); setError(""); setNotice("");
    try { await adminApi(`/api/admin/staff/${item.userId}`, jsonRequest("PATCH", { isActive: !item.isActive })); await load(); setNotice(statusNotice(item.displayName, item.isActive ? "Nonaktif" : "Aktif")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Akses staf belum dapat diperbarui. Coba lagi."); }
    finally { setBusy(false); }
  }
  async function remove(item: Staff) {
    setBusy(true); setNotice(""); setError("");
    try {
      await adminApi(`/api/admin/staff/${item.userId}`, { method: "DELETE" });
      setCredentials(null); setEditing(null); setPassword(""); setNotice({ text: "Akun kasir dihapus. Riwayat transaksi tetap tersimpan.", subject: item.displayName });
      if (page > 1 && staff.length === 1) setPage(page - 1); else await load();
    } finally { setBusy(false); }
  }
  return <div className="admin-stack">
    <Panel><div className="admin-section-head"><h2>{t("Akun staf")}</h2><Button disabled={busy} onClick={() => begin("new")}>{t("Tambah Kasir")}</Button></div>
      <p className="muted">{t("Pemilik membuat akun kasir. Nonaktifkan untuk jeda akses, atau hapus untuk mengeluarkan akun dari daftar.")}</p>
      {error && <Alert>{t(error)}</Alert>}
      {editing && <form className="admin-form" onSubmit={save}><h3>{t(passwordEditing ? "Atur kata sandi kasir" : editing === "new" ? "Kasir baru" : "Ubah nama staf")}</h3>
        <div className="admin-form-grid credential-grid">
          {!passwordEditing && <label>{t("Nama staf")}<Input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>}
          <label>{t("Email")}<Input type="email" required readOnly={editing !== "new"} maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          {(editing === "new" || passwordEditing) && <label>{t(passwordEditing ? "Kata sandi baru" : "Kata sandi kasir")}<PasswordInput autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
        </div>
        <div className="admin-actions"><Button disabled={busy}>{busy ? t("Menyimpan\u2026") : t(passwordEditing ? "Simpan kata sandi" : "Simpan staf")}</Button><Button type="button" className="secondary-button" disabled={busy} onClick={() => { setEditing(null); setPassword(""); }}>{t("Batal")}</Button></div>
      </form>}
    </Panel>
    <Panel><h2>{t("Daftar akun")}</h2>
      {loading ? <LoadingState variant="table">{t("Memuat staf\u2026")}</LoadingState> : staff.length ? <DataTable caption={t("Daftar akun")} columns={[t("Nama staf"), t("Email"), t("Peran"), t("Status"), t("Dibuat"), t("Tindakan")]}>{staff.map((item) => <tr key={item.userId}>
        <th scope="row">{item.displayName}</th><td>{item.email ?? t("Email tidak tersedia")}</td><td>{t(item.role === "ADMIN" ? "Admin" : "Kasir")}</td><td><StatusBadge status={item.isActive ? "ACTIVE" : "INACTIVE"} /></td><td className="date-cell">{formatDate(item.createdAt, locale)}</td>
        <td><div className="admin-row-actions"><Button className="text-button" disabled={busy} onClick={() => begin(item)}>{t("Ubah nama")}</Button>{item.role === "CASHIER" ? <><Button className="text-button" disabled={busy} onClick={() => begin(item, true)}>{t("Atur kata sandi")}</Button><Button className={`text-button ${item.isActive ? "danger-text" : ""}`} disabled={busy} onClick={() => void toggle(item)}>{t(item.isActive ? "Nonaktifkan" : "Aktifkan")}</Button><Button className="text-button danger-text" disabled={busy} onClick={() => setDeleting(item)}>{t("Hapus")}</Button></> : <span className="protected-label">{t("Pemilik eksklusif")}</span>}</div></td>
      </tr>)}</DataTable> : <p className="empty-state">{t("Tidak ada staf pada halaman ini.")}</p>}
    </Panel>
    <Pagination pageSize={pageSize} onPageSizeChange={setPageSize} page={page} hasNext={hasNext} onChange={setPage} disabled={busy || loading} />
    <DetailPane><div className="detail-heading"><h2>{t(credentials ? "Kredensial kasir" : "Akses tim")}</h2>{credentials && <Button className="text-button" onClick={() => setCredentials(null)}>{t("Tutup")}</Button>}</div>
      {credentials ? <div className="credential-preview"><label>{t("Email")}<Input readOnly value={credentials.email} /></label><label>{t("Kata sandi kasir")}<PasswordInput readOnly autoComplete="off" value={credentials.password} /></label><p className="detail-note">{t("Salin dan bagikan secara pribadi. Kredensial ini hilang saat ditutup atau halaman dimuat ulang.")}</p></div> : <><p className="muted">{t("Pemilik mengelola akun kasir untuk restoran ini.")}</p><div className="detail-stat"><span>{t("Akun pada halaman ini")}</span><strong>{staff.length}</strong></div><p className="detail-note">{t("Email dapat dilihat. Kata sandi lama tidak dapat dibaca; atur kata sandi baru jika kasir lupa.")}</p></>}
    </DetailPane>
    {deleting && <ConfirmDelete name={deleting.displayName} description={t("Akun ini dihapus dari daftar dan tidak dapat masuk lagi. Riwayat transaksi tetap tersimpan.")} onClose={() => setDeleting(null)} onConfirm={() => remove(deleting)} />}
  </div>;
}
