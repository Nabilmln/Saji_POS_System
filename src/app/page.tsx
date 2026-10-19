"use client";

import { useLocale } from "@/components/locale-provider";

import Link from "next/link";
import { EntryHeader } from "@/components/ui/entry-header";

export default function Home() {
  const { t } = useLocale();
  return <main className="entry-page">
    <EntryHeader />
    <h1>{t("Pesan dari meja Anda.")}</h1>
    <p>{t("Pindai kode QR di meja Anda untuk melihat menu dan mulai memesan.")}</p>
    <hr />
    <p className="muted">{t("Arahkan kamera ponsel ke kode QR yang tersedia di meja.")}</p>
    <div className="entry-access"><Link className="secondary-button" href="/login">{t("Masuk")}</Link></div>
  </main>;
}
