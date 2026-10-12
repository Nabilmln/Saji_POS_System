import { Suspense } from "react";
import { PosFrame } from "@/components/pos-frame";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="loading-block" role="status">Menyiapkan area kasir…</div>}><PosFrame>{children}</PosFrame></Suspense>;
}
