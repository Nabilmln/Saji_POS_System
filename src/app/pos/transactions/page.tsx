import { PosTransactions } from "@/components/pos-transactions";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

export default function TransactionsPage() { return <PosTransactions />; }
