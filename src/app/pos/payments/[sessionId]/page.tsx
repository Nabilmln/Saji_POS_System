import { Text } from "@/components/locale-provider";
import { LoadingState } from "@/components/ui/controls";
import { Suspense } from "react";
import { PosPayment } from "@/components/pos-payment";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

async function Content({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <PosPayment key={sessionId} sessionId={sessionId} />;
}

export default function PaymentPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return <Suspense fallback={<LoadingState className="loading-block" role="status"><Text value="Menyiapkan pembayaran…" /></LoadingState>}><Content params={params} /></Suspense>;
}
