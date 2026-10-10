import { apiSuccess } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/guards";

export async function GET(request: Request) {
  const staff = await requireStaff(request);
  if (staff instanceof Response) return staff;
  return apiSuccess({ userId: staff.userId, displayName: staff.displayName, role: staff.role });
}
