import { auth } from "@/lib/auth/server";
import { apiError } from "@/lib/api-response";

const handler = auth.handler();
type Context = { params: Promise<{ path: string[] }> };

async function forward(method: keyof typeof handler, request: Request, context: Context) {
  const { path } = await context.params;
  let first = path[0] ?? "";
  try {
    first = decodeURIComponent(decodeURIComponent(first));
  } catch {
    return apiError(404, "NOT_FOUND", "Route not found");
  }
  if (first.split("/")[0].toLowerCase() === "admin") {
    return apiError(404, "NOT_FOUND", "Route not found");
  }
  return handler[method](request, context);
}

export const GET = (request: Request, context: Context) => forward("GET", request, context);
export const POST = (request: Request, context: Context) => forward("POST", request, context);
export const PUT = (request: Request, context: Context) => forward("PUT", request, context);
export const DELETE = (request: Request, context: Context) => forward("DELETE", request, context);
export const PATCH = (request: Request, context: Context) => forward("PATCH", request, context);
