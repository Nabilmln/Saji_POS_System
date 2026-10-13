import { LoadingState } from "@/components/ui/controls";
import { AdminFrame } from "@/components/admin-frame";
import { Suspense } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState className="loading-block" role="status">Menyiapkan ruang pemilik…</LoadingState>}><AdminFrame>{children}</AdminFrame></Suspense>;
}
