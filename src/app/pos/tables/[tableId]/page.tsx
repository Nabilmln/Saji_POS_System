import { Text } from "@/components/locale-provider";
import { LoadingState } from "@/components/ui/controls";
import { Suspense } from "react";
import { PosTable } from "@/components/pos-table";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

async function Content({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return <PosTable tableId={tableId} />;
}

export default function PosTablePage({ params }: { params: Promise<{ tableId: string }> }) {
  return <Suspense fallback={<LoadingState className="loading-block" role="status"><Text value="Menyiapkan meja…" /></LoadingState>}><Content params={params} /></Suspense>;
}
