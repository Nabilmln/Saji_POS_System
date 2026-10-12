import { afterEach, describe, expect, it, vi } from "vitest";
import { adminApi, AdminApiError, jsonRequest } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("admin API client", () => {
  it("reads the data envelope and sends JSON mutations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: "menu-1" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await adminApi<{ id: string }>("/api/admin/menus", jsonRequest("POST", { name: "Nasi" }))).toEqual({ id: "menu-1" });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/menus", expect.objectContaining({
      method: "POST", body: '{"name":"Nasi"}',
    }));
  });
  it("retains conflict codes and field errors for forms", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      error: { code: "SETTINGS_CHANGED", message: "stale", fields: { expectedVersion: ["stale"] } },
    }, { status: 409 })));
    await expect(adminApi("/api/admin/settings/billing")).rejects.toMatchObject({
      status: 409, code: "SETTINGS_CHANGED", fields: { expectedVersion: ["stale"] },
    } satisfies Partial<AdminApiError>);
  });
});
