import { Suspense } from "react";
import { PosPayment } from "@/components/pos-payment";

async function Content({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <PosPayment key={sessionId} sessionId={sessionId} />;
}

export default function PaymentPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return <Suspense fallback={<div className="loading-block" role="status">Menyiapkan pembayaran…</div>}><Content params={params} /></Suspense>;
}
