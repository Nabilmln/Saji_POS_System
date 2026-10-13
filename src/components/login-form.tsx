"use client";

import { useLocale } from "@/components/locale-provider";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import { EntryHeader } from "@/components/ui/entry-header";
import { PasswordInput, Input, Alert, Button } from "@/components/ui/controls";

export function LoginForm({ role = "CASHIER" }: { role?: "ADMIN" | "CASHIER" }) {
  const { t } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      if (resetting) {
        const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/reset-password?role=${role}` });
        if (result.error) throw result.error;
        setNotice("Jika akun ini terdaftar, tautan pengaturan kata sandi akan dikirim ke email Anda."); return;
      }
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) { setError("Email atau kata sandi tidak sesuai."); return; }
      await adminApi(role === "ADMIN" ? "/api/admin/me" : "/api/staff/me");
      router.replace(role === "ADMIN" ? "/admin/reports" : "/pos");
      router.refresh();
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 403) {
        await authClient.signOut(); setError(role === "ADMIN" ? "Akun ini tidak memiliki akses pemilik." : "Akun ini tidak memiliki akses kasir.");
      } else setError("Tidak dapat masuk. Periksa koneksi dan coba lagi.");
    }
    finally { setBusy(false); }
  }

  return <main className="entry-page login-page">
    <EntryHeader />
    <h1>{t(role === "ADMIN" ? "Masuk Pemilik" : "Masuk Kasir")}</h1>
    <p className="muted">{role === "ADMIN" ? t("Kelola menu, tim, dan penjualan restoran Anda.") : t("Gunakan email dan kata sandi yang diberikan pemilik.")}</p>
    <form onSubmit={submit} className="login-form">
      <label className="field-label" htmlFor="staff-email">{t("Email")}</label>
      <Input className="text-field" id="staff-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
      {!resetting && <><label className="field-label" htmlFor="staff-password">{t("Kata sandi")}</label>
      <PasswordInput id="staff-password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></>}
      {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
      {notice && <Alert toast className="inline-alert info" role="status">{t(notice)}</Alert>}
      <Button className="primary-button full-width" disabled={busy}>{busy ? t("Memproses…") : resetting ? t("Kirim tautan pengaturan") : t("Masuk")}</Button>
      <Button type="button" className="text-button" disabled={busy} onClick={() => { setResetting(!resetting); setError(""); setNotice(""); }}>{resetting ? t("Kembali ke masuk") : t("Lupa kata sandi?")}</Button>
    </form>
    <p className="login-footnote">{role === "ADMIN" ? t("Akun pemilik disiapkan secara eksklusif.") : t("Tidak ada pendaftaran mandiri untuk kasir.")}</p>
  </main>;
}
