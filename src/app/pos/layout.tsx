import { Text } from "@/components/locale-provider";
import { LoadingState } from "@/components/ui/controls";
import { Suspense } from "react";
import { StaffFrame } from "@/components/staff-frame";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState variant="page"><Text value="Menyiapkan area kasir…" /></LoadingState>}><StaffFrame role="CASHIER">{children}</StaffFrame></Suspense>;
}
