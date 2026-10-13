"use client";

import { useLocale } from "@/components/locale-provider";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QrCodeIcon, ReceiptIcon } from "@phosphor-icons/react";
import { Brand } from "@/components/ui/brand";
import { LanguageSwitch } from "@/components/ui/language-switch";

const DetailTarget = createContext<HTMLElement | null>(null);

export function DetailPane({ children }: { children: ReactNode }) {
  const target = useContext(DetailTarget);
  return target ? createPortal(<div className="detail-pane">{children}</div>, target) : null;
}

export function CustomerShell({ tableNumber, children, footer }: {
  tableNumber?: string; children: ReactNode; footer?: ReactNode;
}) {
  const { t } = useLocale();
  return <div className="customer-page">
    <header className="customer-header">
      <Link className="brand-link" href="/" aria-label={t("Saji beranda")}><Brand /></Link>
      <div className="customer-header-actions">{tableNumber && <span className="table-badge">{t("Meja")}{" "}{tableNumber}</span>}<LanguageSwitch /></div>
    </header>
    <main className="customer-main">{children}</main>
    {footer}
  </div>;
}

export function StaffShell({ role, title, navigation, children }: {
  role: "Kasir" | "Admin"; title: string; navigation: ReactNode; children: ReactNode;
}) {
  const { t } = useLocale();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return <DetailTarget value={target}><div className="staff-shell">
    <aside className="staff-sidebar" aria-label={t("Navigasi {0}", { "0": t(role) })}>
      <div className="workspace-brand"><Brand /><LanguageSwitch /></div>
      <p className="staff-nav-label">{role === "Admin" ? t("Ruang pemilik") : t("Ruang kasir")}</p>
      <nav>{navigation}</nav>
    </aside>
    <main className="staff-content"><header className="workspace-heading"><h1>{t(title)}</h1><span className="workspace-role">{role === "Admin" ? t("Pemilik") : t("Kasir")}</span></header>{children}</main>
    <aside ref={setTarget} className="workspace-detail" aria-label={role === "Admin" ? t("Detail pemilik") : t("Detail pesanan")}><div className="detail-placeholder">{role === "Admin" ? <QrCodeIcon size={32} weight="light" /> : <ReceiptIcon size={32} weight="light" />}<h2>{role === "Admin" ? t("Rincian pilihan") : t("Detail pesanan")}</h2><p>{role === "Admin" ? t("Pilih item di area utama untuk melihat rinciannya.") : t("Pilih meja untuk meninjau pesanan dan status penyajian.")}</p></div></aside>
  </div></DetailTarget>;
}
