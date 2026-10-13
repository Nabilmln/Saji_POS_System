import { StaffManager } from "@/components/admin-staff-manager";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

export default function StaffPage() { return <StaffManager />; }
