import { StaffFrame } from "@/components/staff-frame";

export function PosFrame({ children }: { children: React.ReactNode }) {
  return <StaffFrame role="CASHIER">{children}</StaffFrame>;
}
