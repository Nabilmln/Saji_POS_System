import { CustomerRoute } from "@/components/customer-route";

export default function OrderPage({ params }: { params: Promise<{ tableToken: string }> }) {
  return <CustomerRoute params={params} view="menu" />;
}
