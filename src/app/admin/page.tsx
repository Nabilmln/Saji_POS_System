import { redirect } from "next/navigation";

// The staff layout defers this segment until its client-side access check finishes.
export const instant = false;

export default function AdminPage() { redirect("/admin/reports"); }
