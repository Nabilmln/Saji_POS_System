import { CustomerRoute } from "@/components/customer-route";

export default function CartPage({ params }: { params: Promise<{ tableToken: string }> }) {
  return <CustomerRoute params={params} view="cart" />;
}
