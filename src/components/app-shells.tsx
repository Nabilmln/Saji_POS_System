"use client";

import { useLocale } from "@/components/locale-provider";

import Link from "next/link";
import { createContext, Suspense, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QrCodeIcon, ReceiptIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { Brand } from "@/components/ui/brand";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { NoticeProvider } from "@/components/ui/notice";
import { ConfirmationProvider } from "@/components/ui/confirmation";
import { EntranceMotion } from "@/components/ui/entrance-motion";
import { Button } from "@/components/ui/controls";

const DetailTarget = createContext<HTMLElement | null>(null);

export function DetailPane({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const target = useContext(DetailTarget);
  const { t } = useLocale();
  return target ? createPortal(<div className={`detail-pane${footer ? " detail-pane-with-footer" : ""}`}>{footer ? <><div className="detail-pane-content" tabIndex={0} role="region" aria-label={t("Rincian pilihan")}>{children}</div><div className="detail-pane-footer">{footer}</div></> : children}</div>, target) : null;
}

export function CustomerShell({ tableNumber, children, footer }: {
  tableNumber?: string; children: ReactNode; footer?: ReactNode;
}) {
  const { t } = useLocale();
  const content = useRef<HTMLElement>(null);
  return <div className="customer-page">
    <header className="customer-header">
      <Link className="brand-link" href="/" aria-label={t("Saji beranda")}><Brand /></Link>
      <div className="customer-header-actions">{tableNumber && <span className="table-badge">{t("Meja")}{" "}{tableNumber}</span>}<LanguageSwitch /></div>
    </header>
    <main ref={content} className="customer-main">{children}</main>
    <Suspense fallback={null}><EntranceMotion target={content} /></Suspense>
    {footer}
  </div>;
}

export function StaffShell({ role, title, navigation, children }: {
  role: "Kasir" | "Admin"; title: string; navigation: ReactNode; children: ReactNode;
}) {
  const { t } = useLocale();
  const content = useRef<HTMLElement>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const navigationId = useId();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setCollapsed(localStorage.getItem("saji:sidebar-collapsed") === "true"); } catch { /* Navigation still works without saved preferences. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  function toggleNavigation() {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("saji:sidebar-collapsed", String(next)); } catch { /* Keep the preference for this workspace. */ }
  }
  return <NoticeProvider><ConfirmationProvider><DetailTarget value={target}><div className={`staff-shell${collapsed ? " sidebar-collapsed" : ""}`}>
    <header className="workspace-heading workspace-toolbar"><div className="workspace-title"><Button type="button" className="icon-button navigation-toggle" aria-label={t(collapsed ? "Perluas navigasi" : "Ciutkan navigasi")} title={t(collapsed ? "Perluas navigasi" : "Ciutkan navigasi")} aria-expanded={!collapsed} aria-controls={navigationId} onClick={toggleNavigation}><SidebarSimpleIcon size={20} aria-hidden="true" /></Button><h1>{t(title)}</h1></div><div className="workspace-header-actions"><span className="workspace-role">{role === "Admin" ? t("Pemilik") : t("Kasir")}</span><LanguageSwitch /></div></header>
    <aside className="staff-sidebar" aria-label={t("Navigasi {0}", { "0": t(role) })}>
      <div className="workspace-brand"><Brand /></div>
      <p className="staff-nav-label">{role === "Admin" ? t("Ruang pemilik") : t("Ruang kasir")}</p>
      <nav id={navigationId}>{navigation}</nav>
    </aside>
    <main ref={content} className="staff-content">{children}</main>
    <aside ref={setTarget} className="workspace-detail" tabIndex={0} aria-label={role === "Admin" ? t("Detail pemilik") : t("Detail kasir")}><div className="detail-placeholder">{role === "Admin" ? <QrCodeIcon size={32} weight="light" /> : <ReceiptIcon size={32} weight="light" />}<h2>{t("Rincian pilihan")}</h2><p>{role === "Admin" ? t("Pilih item di area utama untuk melihat rinciannya.") : t("Pilih meja atau transaksi untuk melihat pesanan, tagihan, atau struk.")}</p></div></aside>
    <Suspense fallback={null}><EntranceMotion target={content} /></Suspense>
  </div></DetailTarget></ConfirmationProvider></NoticeProvider>;
}
