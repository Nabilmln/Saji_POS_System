import "server-only";
import sharp from "sharp";
import { AwsClient } from "aws4fetch";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { apiError } from "./api-response";
import { MAX_MENU_IMAGE_BYTES, MENU_IMAGE_PATH, MENU_IMAGE_TYPES } from "./menu-images";

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
    return await image.rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85, effort: 2 }).toBuffer();
  } catch {
    return apiError(422, "INVALID_IMAGE", "Image cannot be read; choose another file");
  } finally { reader.releaseLock(); }
}

function imageStorage(path: string, init?: RequestInit) {
  const { AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey, AWS_ENDPOINT_URL_S3: endpoint, AWS_REGION: region } = process.env;
  if (!accessKeyId || !secretAccessKey || !endpoint || !region) throw new Error("Menu image storage is not configured");
  const client = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3", retries: 1 });
  return client.fetch(`${endpoint.replace(/\/$/, "")}/images${path}`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
}

export function menuImageObject(id: string, init?: RequestInit) {
  if (!MENU_IMAGE_PATH.test(`/api/menu-images/${id}`)) throw new Error("Invalid menu image ID");
  return imageStorage(`/menus/${id}.webp`, init);
}

export async function* listMenuImages() {
  const parser = new XMLParser({ parseTagValue: false });
  const seen = new Set<string>();
  let token: string | undefined;
  do {
    const query = new URLSearchParams({ "list-type": "2", prefix: "menus/", "max-keys": "1000" });
    if (token) query.set("continuation-token", token);
    const response = await imageStorage(`?${query}`);
    if (!response.ok) throw new Error("Menu image listing unavailable");
    const xml = await response.text();
    if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("Invalid image storage listing");
    const page = parser.parse(xml).ListBucketResult;
    if (!page || !["true", "false"].includes(page.IsTruncated)) throw new Error("Invalid image storage listing");
    for (const item of page.Contents ? (Array.isArray(page.Contents) ? page.Contents : [page.Contents]) : []) {
      if (typeof item.Key !== "string" || !item.Key.startsWith("menus/") || !item.Key.endsWith(".webp")) continue;
      const id = item.Key.slice(6, -5);
      const modifiedAt = Date.parse(item.LastModified);
      if (MENU_IMAGE_PATH.test(`/api/menu-images/${id}`) && Number.isFinite(modifiedAt)) yield { id, modifiedAt };
    }
    token = page.IsTruncated === "true" ? page.NextContinuationToken : undefined;
    if (page.IsTruncated === "true" && (typeof token !== "string" || !token || seen.has(token))) throw new Error("Invalid image storage continuation");
    if (token) seen.add(token);
  } while (token);
}
