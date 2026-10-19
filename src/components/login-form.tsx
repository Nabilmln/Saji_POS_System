"use client";

import { useLocale } from "@/components/locale-provider";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { isAuthApiError } from "@neondatabase/auth/next";
import { authClient } from "@/lib/auth/client";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import { Brand } from "@/components/ui/brand";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { PasswordInput, Input, Alert, Button } from "@/components/ui/controls";

export function LoginForm() {
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
        const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/reset-password` });
        if (result.error) throw result.error;
        setNotice("Jika akun ini terdaftar, tautan pengaturan kata sandi akan dikirim ke email Anda."); return;
      }
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) { setError("Email atau kata sandi tidak sesuai."); return; }
      const account = await adminApi<{ role: "ADMIN" | "CASHIER" }>("/api/me");
      router.replace(account.role === "ADMIN" ? "/admin/reports" : "/pos");
      router.refresh();
    } catch (cause) {
      if (!resetting && isAuthApiError(cause) && cause.status === 401) {
        setError("Email atau kata sandi tidak sesuai.");
      } else if (cause instanceof AdminApiError && cause.status === 403) {
        setError("Akun ini tidak memiliki akses aktif. Hubungi pemilik.");
        try { await authClient.signOut(); } catch { setError("Tidak dapat masuk. Periksa koneksi dan coba lagi."); }
      } else setError("Tidak dapat masuk. Periksa koneksi dan coba lagi.");
    }
    finally { setBusy(false); }
  }

  return <main className="login-page">
    <header className="login-header"><LanguageSwitch /></header>
    <section className="login-panel" aria-labelledby="login-heading">
    <Brand />
    <h1 id="login-heading">{t(resetting ? "Atur kata sandi" : "Masuk ke Saji")}</h1>
    <p className="login-intro">{t(resetting ? "Kirim tautan pemulihan ke email akun Anda." : "Gunakan email dan kata sandi akun Anda.")}</p>
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
    <p className="login-footnote">{t("Akun kasir dibuat oleh pemilik. Tidak ada pendaftaran mandiri.")}</p>
    </section>
  </main>;
}
