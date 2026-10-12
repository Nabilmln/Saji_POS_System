import { CustomerRoute } from "@/components/customer-route";

export default function StatusPage({ params }: { params: Promise<{ tableToken: string }> }) {
  return <CustomerRoute params={params} view="status" />;
}
