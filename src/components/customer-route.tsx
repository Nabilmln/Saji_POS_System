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
  return <Suspense fallback={<CustomerShell><div className="loading-block" role="status">Menyiapkan halaman…</div></CustomerShell>}>
    <Content params={params} view={view} />
  </Suspense>;
}
