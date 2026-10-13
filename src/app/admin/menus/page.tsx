import { MenuManager } from "@/components/admin-menu-manager";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

export default function AdminMenusPage() { return <MenuManager />; }
