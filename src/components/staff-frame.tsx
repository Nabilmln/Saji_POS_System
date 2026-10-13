"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChartLineUpIcon, SquaresFourIcon, QrCodeIcon, SlidersHorizontalIcon, UsersIcon, CalendarBlankIcon, ReceiptIcon, SignOutIcon } from "@phosphor-icons/react";
import { StaffShell } from "@/components/app-shells";
import { Brand } from "@/components/ui/brand";
import { Button } from "@/components/ui/controls";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import { authClient } from "@/lib/auth/client";

const menus = {
  ADMIN: [
    { href: "/admin/reports", label: "Laporan Penjualan", icon: <ChartLineUpIcon size={19} /> },
    { href: "/admin/menus", label: "Menu & Kategori", icon: <SquaresFourIcon size={19} /> },
    { href: "/admin/tables", label: "Meja & QR", icon: <QrCodeIcon size={19} /> },
    { href: "/admin/settings", label: "Diskon & Pajak", icon: <SlidersHorizontalIcon size={19} /> },
    { href: "/admin/staff", label: "Akun Staf", icon: <UsersIcon size={19} /> },
  ],
  CASHIER: [
    { href: "/pos", label: "Meja & Pesanan", icon: <SquaresFourIcon size={19} /> },
    { href: "/pos/reservations", label: "Reservasi", icon: <CalendarBlankIcon size={19} /> },
    { href: "/pos/transactions", label: "Riwayat Transaksi", icon: <ReceiptIcon size={19} /> },
  ],
};

export function StaffFrame({ role, children }: { role: "ADMIN" | "CASHIER"; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const loginPath = role === "ADMIN" ? "/owner-login" : "/login";
  const [name, setName] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "login" | "forbidden" | "error">("loading");
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    let active = true;
    adminApi<{ displayName: string }>(role === "ADMIN" ? "/api/admin/me" : "/api/staff/me")
      .then((user) => { if (active) { setName(user.displayName); setState("ready"); } })
      .catch((cause: unknown) => { if (active) setState(cause instanceof AdminApiError && cause.status === 401 ? "login" : cause instanceof AdminApiError && cause.status === 403 ? "forbidden" : "error"); });
    return () => { active = false; };
  }, [role]);
  if (state !== "ready") return <main className="entry-page"><Brand /><h1>{state === "loading" ? "Memeriksa akses…" : state === "login" ? "Masuk diperlukan" : state === "forbidden" ? "Akses ditolak" : "Tidak dapat memuat halaman"}</h1><p className="muted">{state === "forbidden" ? "Akun ini tidak memiliki izin untuk ruang kerja ini." : state === "login" ? `Masuk dengan akun ${role === "ADMIN" ? "pemilik" : "kasir"}.` : state === "error" ? "Periksa koneksi lalu coba lagi." : ""}</p>{state === "error" ? <Button onClick={() => window.location.reload()}>Coba Lagi</Button> : state !== "loading" && <Link className="primary-button" href={loginPath}>Masuk {role === "ADMIN" ? "Pemilik" : "Kasir"}</Link>}</main>;
  const links = menus[role];
  const current = links.find((link) => link.href === "/pos" ? !pathname.startsWith("/pos/reservations") && !pathname.startsWith("/pos/transactions") : pathname.startsWith(link.href));
  const navigation = <>{links.map((link) => <Link className={`staff-nav-item ${current?.href === link.href ? "active" : ""}`} href={link.href} key={link.href} aria-current={current?.href === link.href ? "page" : undefined}>{link.icon}<span>{link.label}</span></Link>)}<div className="staff-account-block"><span className="account-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span><div><strong>{name}</strong><small>{role === "ADMIN" ? "Pemilik eksklusif" : "Kasir"}</small></div><Button className="icon-button" aria-label="Keluar" onClick={async () => { try { const result = await authClient.signOut(); if (result.error) throw result.error; router.replace(loginPath); router.refresh(); } catch { setLogoutError("Tidak dapat keluar. Coba lagi."); } }}><SignOutIcon size={19} /></Button></div>{logoutError && <p className="inline-alert" role="alert">{logoutError}</p>}</>;
  return <StaffShell role={role === "ADMIN" ? "Admin" : "Kasir"} title={pathname.startsWith("/pos/payments") ? "Pembayaran Tunai" : current?.label ?? "Saji"} navigation={navigation}>{children}</StaffShell>;
}
