import { Text } from "@/components/locale-provider";
import { LoadingState } from "@/components/ui/controls";
import { StaffFrame } from "@/components/staff-frame";
import { Suspense } from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState variant="page"><Text value="Menyiapkan ruang pemilik…" /></LoadingState>}><StaffFrame role="ADMIN">{children}</StaffFrame></Suspense>;
}
