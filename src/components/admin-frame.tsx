import { StaffFrame } from "@/components/staff-frame";

export function AdminFrame({ children }: { children: React.ReactNode }) {
  return <StaffFrame role="ADMIN">{children}</StaffFrame>;
}
