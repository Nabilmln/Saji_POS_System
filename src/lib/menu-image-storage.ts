import "server-only";
import sharp from "sharp";
import { AwsClient } from "aws4fetch";
import { apiError } from "./api-response";
import { MAX_MENU_IMAGE_BYTES, MENU_IMAGE_TYPES } from "./menu-images";

export async function readMenuImage(request: Request): Promise<Buffer | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) return apiError(422, "INVALID_IMAGE", "Choose a JPG, PNG or WebP image");
  const limit = MAX_MENU_IMAGE_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) return apiError(413, "IMAGE_TOO_LARGE", "Image must be 3 MB or smaller");
  const reader = request.body?.getReader();
  if (!reader) return apiError(422, "INVALID_IMAGE", "Choose an image");
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return apiError(413, "IMAGE_TOO_LARGE", "Image must be 3 MB or smaller");
      }
      chunks.push(Buffer.from(value));
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || !MENU_IMAGE_TYPES.includes(file.type)) return apiError(422, "INVALID_IMAGE", "Choose a JPG, PNG or WebP image");
    if (file.size > MAX_MENU_IMAGE_BYTES) return apiError(413, "IMAGE_TOO_LARGE", "Image must be 3 MB or smaller");
    const image = sharp(await file.arrayBuffer(), { limitInputPixels: 25_000_000 });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) return apiError(422, "INVALID_IMAGE", "Choose a static JPG, PNG or WebP image");
    return await image.rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    return apiError(422, "INVALID_IMAGE", "Image cannot be read; choose another file");
  } finally { reader.releaseLock(); }
}

export function menuImageObject(id: string, init?: RequestInit) {
  const { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey, AWS_ENDPOINT_URL_S3: endpoint, AWS_REGION: region } = process.env;
  if (!accessKeyId || !secretAccessKey || !endpoint || !region) throw new Error("Menu image storage is not configured");
  const client = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3", retries: 1 });
  return client.fetch(`${endpoint.replace(/\/$/, "")}/images/menus/${id}.webp`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
}
