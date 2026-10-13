import { Text } from "@/components/locale-provider";
import { LoadingState } from "@/components/ui/controls";
import { Suspense } from "react";
import { PosTransactions } from "@/components/pos-transactions";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

async function Content({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <PosTransactions key={paymentId} initialReceiptId={paymentId} />;
}

export default function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  return <Suspense fallback={<LoadingState className="loading-block" role="status"><Text value="Menyiapkan struk…" /></LoadingState>}><Content params={params} /></Suspense>;
}
