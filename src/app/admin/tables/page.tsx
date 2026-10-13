import { TableManager } from "@/components/admin-table-manager";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

export default function AdminTablesPage() { return <TableManager />; }
