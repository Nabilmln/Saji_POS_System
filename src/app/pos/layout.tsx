import { LoadingState } from "@/components/ui/controls";
import { Suspense } from "react";
import { PosFrame } from "@/components/pos-frame";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingState className="loading-block" role="status">Menyiapkan area kasir…</LoadingState>}><PosFrame>{children}</PosFrame></Suspense>;
}
