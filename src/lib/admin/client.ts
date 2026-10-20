import type { PageInfo } from "../pagination";

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
  CATEGORY_NOT_FOUND: "Kategori tidak ditemukan.",
  MENU_NOT_FOUND: "Menu tidak ditemukan.",
  INVALID_IMAGE: "Pilih foto JPG, PNG, atau WebP yang valid.",
  IMAGE_TOO_LARGE: "Ukuran foto maksimal 3 MB.",
  IMAGE_UPLOAD_FAILED: "Foto belum dapat diunggah. Coba lagi sebelum menyimpan menu.",
  TABLE_EXISTS: "Nomor meja sudah digunakan.",
  STAFF_NOT_FOUND: "Akun staf tidak ditemukan.",
  OWNER_PROTECTED: "Akun pemilik tidak dapat dihapus atau dinonaktifkan.",
  AUTH_UNAVAILABLE: "Layanan akun belum dapat dihubungi. Coba lagi.",
  AUTH_PASSWORD_FAILED: "Kata sandi belum dapat diperbarui. Sesi kasir mungkin sudah diakhiri; coba lagi.",
  TABLE_NOT_AVAILABLE: "Meja sedang terisi atau direservasi. Coba lagi setelah tersedia.",
  SETTINGS_CHANGED: "Pengaturan telah berubah. Muat ulang dan periksa nilainya sebelum menyimpan.",
  VALIDATION_ERROR: "Periksa kembali isian formulir.",
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const result = await response.json().catch(() => {
    throw new AdminApiError("Respons server tidak dapat dibaca. Coba lagi.", response.status, "INVALID_RESPONSE", null);
  }) as {
    data?: T; pagination?: PageInfo; error?: { code: string; message: string; fields: Record<string, string[]> | null };
  };
  if (!response.ok || result.error) {
    const error = result.error;
    throw new AdminApiError(
      messages[error?.code ?? ""] ?? (response.status === 401 ? "Silakan masuk kembali." : response.status === 403 ? "Anda tidak memiliki akses ke halaman ini." : "Permintaan gagal. Coba lagi."),
      response.status, error?.code ?? "REQUEST_FAILED", error?.fields ?? null,
    );
  }
  return { data: result.data as T, pagination: result.pagination };
}

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request<T>(path, init)).data;
}

export async function adminPage<T>(path: string): Promise<{ items: T[]; hasNext: boolean }> {
  const result = await request<T[]>(path);
  if (!result.pagination) throw new AdminApiError("Respons halaman tidak lengkap. Coba lagi.", 502, "INVALID_RESPONSE", null);
  return { items: result.data, hasNext: result.pagination.hasNext };
}

export function jsonRequest(method: "POST" | "PATCH" | "PUT", body: object): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
