import { LoadingState } from "@/components/ui/controls";
import { Suspense } from "react";
import { PasswordResetForm } from "@/components/password-reset-form";

type ResetParams = Promise<{ token?: string | string[]; role?: string | string[] }>;

async function Content({ searchParams }: { searchParams: ResetParams }) {
  const params = await searchParams;
  return <PasswordResetForm token={typeof params.token === "string" ? params.token : undefined} role={params.role === "ADMIN" ? "ADMIN" : "CASHIER"} />;
}

export default function ResetPasswordPage({ searchParams }: { searchParams: ResetParams }) {
  return <Suspense fallback={<LoadingState className="loading-block" role="status">Menyiapkan halaman…</LoadingState>}><Content searchParams={searchParams} /></Suspense>;
}
