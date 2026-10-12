import { Suspense } from "react";
import { PosTable } from "@/components/pos-table";

async function Content({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return <PosTable tableId={tableId} />;
}

export default function PosTablePage({ params }: { params: Promise<{ tableId: string }> }) {
  return <Suspense fallback={<div className="loading-block" role="status">Menyiapkan meja…</div>}><Content params={params} /></Suspense>;
}
