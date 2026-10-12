import { Suspense } from "react";
import { PosReceipt } from "@/components/pos-receipt";

async function Content({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <PosReceipt key={paymentId} paymentId={paymentId} />;
}

export default function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  return <Suspense fallback={<div className="loading-block" role="status">Menyiapkan struk…</div>}><Content params={params} /></Suspense>;
}
