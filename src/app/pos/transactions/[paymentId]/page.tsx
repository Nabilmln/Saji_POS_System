import { Text } from "@/components/locale-provider";
import { LoadingState } from "@/components/ui/controls";
import { Suspense } from "react";
import { PosReceipt } from "@/components/pos-receipt";

async function Content({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  return <PosReceipt key={paymentId} paymentId={paymentId} />;
}

export default function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  return <Suspense fallback={<LoadingState className="loading-block" role="status"><Text value="Menyiapkan struk…" /></LoadingState>}><Content params={params} /></Suspense>;
}
