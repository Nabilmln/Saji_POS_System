import { apiSuccess } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth/guards";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  return apiSuccess({ userId: admin.userId, displayName: admin.displayName, role: admin.role });
}
