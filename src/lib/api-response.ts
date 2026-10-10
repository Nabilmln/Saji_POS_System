import type { ZodError } from "zod";

const noStore = { "Cache-Control": "no-store" };

export function apiSuccess<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status, headers: noStore });
}

export function apiError(
  status: number,
  code: string,
  message: string,
  fields: Record<string, string[]> | null = null,
): Response {
  return Response.json(
    { error: { code, message, details: null, fields } },
    { status, headers: noStore },
  );
}

export function apiValidationError(error: ZodError): Response {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_root";
    (fields[key] ??= []).push(issue.message);
  }
  return apiError(422, "VALIDATION_ERROR", "Invalid request", fields);
}
