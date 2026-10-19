import { apiSuccess } from "@/lib/api-response";
import { requireAccount } from "@/lib/auth/guards";

export async function GET(request: Request) {
  const account = await requireAccount(request);
  if (account instanceof Response) return account;
  return apiSuccess({ userId: account.userId, displayName: account.displayName, role: account.role });
}
