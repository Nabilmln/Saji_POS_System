export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields: Record<string, string[]> | null,
  ) { super(message); }
}

const messages: Record<string, string> = {
  CATEGORY_EXISTS: "Nama kategori sudah digunakan.",
  CATEGORY_IN_USE: "Kategori masih memiliki menu. Nonaktifkan kategori ini.",
  CATEGORY_NOT_FOUND: "Kategori tidak ditemukan.",
  MENU_NOT_FOUND: "Menu tidak ditemukan.",
  TABLE_EXISTS: "Nomor meja sudah digunakan.",
  TABLE_NOT_AVAILABLE: "Meja sedang terisi atau direservasi. Coba lagi setelah tersedia.",
  SETTINGS_CHANGED: "Pengaturan telah berubah. Muat ulang dan periksa nilainya sebelum menyimpan.",
  VALIDATION_ERROR: "Periksa kembali isian formulir.",
};

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...init });
  const result = await response.json().catch(() => {
    throw new AdminApiError("Respons server tidak dapat dibaca. Coba lagi.", response.status, "INVALID_RESPONSE", null);
  }) as {
    data?: T; error?: { code: string; message: string; fields: Record<string, string[]> | null };
  };
  if (!response.ok || result.error) {
    const error = result.error;
    throw new AdminApiError(
      messages[error?.code ?? ""] ?? (response.status === 401 ? "Silakan masuk kembali." : response.status === 403 ? "Anda tidak memiliki akses ke halaman ini." : "Permintaan gagal. Coba lagi."),
      response.status, error?.code ?? "REQUEST_FAILED", error?.fields ?? null,
    );
  }
  return result.data as T;
}

export function jsonRequest(method: "POST" | "PATCH" | "PUT", body: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
