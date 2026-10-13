"use client";

import { useLocale } from "@/components/locale-provider";
import { LoadingState } from "@/components/ui/controls";
import { Suspense } from "react";
import { CustomerApp } from "@/components/customer-app";
import { CustomerShell } from "@/components/app-shells";

async function Content({ params, view }: {
  params: Promise<{ tableToken: string }>; view: "menu" | "cart" | "status";
}) {
  const { tableToken } = await params;
  return <CustomerApp tableToken={tableToken} view={view} />;
}

export function CustomerRoute({ params, view }: {
  params: Promise<{ tableToken: string }>; view: "menu" | "cart" | "status";
}) {
  const { t } = useLocale();
  return <Suspense fallback={<CustomerShell><LoadingState className="loading-block" role="status">{t("Menyiapkan halaman…")}</LoadingState></CustomerShell>}>
    <Content params={params} view={view} />
  </Suspense>;
}
