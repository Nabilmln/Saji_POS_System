import { LoadingState } from "@/components/ui/loading-state";
import { Text } from "@/components/locale-provider";

export default function Loading() {
  return <LoadingState variant="page"><Text value="Menyiapkan area kasir…" /></LoadingState>;
}
