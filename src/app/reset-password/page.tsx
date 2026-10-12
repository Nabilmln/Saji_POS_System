import { Suspense } from "react";
import { PasswordResetForm } from "@/components/password-reset-form";

async function Content({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const params = await searchParams;
  return <PasswordResetForm token={typeof params.token === "string" ? params.token : undefined} />;
}

export default function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  return <Suspense fallback={<div className="loading-block" role="status">Menyiapkan halaman…</div>}><Content searchParams={searchParams} /></Suspense>;
}
