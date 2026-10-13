import { BillingSettings } from "@/components/admin-billing-settings";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

export default function AdminSettingsPage() { return <BillingSettings />; }
