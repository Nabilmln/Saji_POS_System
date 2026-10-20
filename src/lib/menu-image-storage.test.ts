import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { readMenuImage, menuImageObject } from "./menu-image-storage";
import { MAX_MENU_IMAGE_BYTES } from "./menu-images";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function request(file: File) {
  const form = new FormData(); form.set("file", file);
  return new Request("http://localhost/upload", { method: "POST", body: form });
}

it("decodes, scales and converts valid photos to static WebP without metadata", async () => {
  const input = await sharp({ create: { width: 1800, height: 900, channels: 3, background: "yellow" } }).jpeg().withExif({ IFD0: { Artist: "Private metadata" } }).toBuffer();
  const result = await readMenuImage(request(new File([new Uint8Array(input)], "photo.jpg", { type: "image/jpeg" })));
  expect(result).not.toBeInstanceOf(Response);
  const metadata = await sharp(result as Buffer).metadata();
  expect(metadata).toMatchObject({ format: "webp", width: 1600, height: 800 });
  expect(metadata.exif).toBeUndefined();
});

it("rejects mislabeled SVG, corrupt files, empty files and oversized uploads", async () => {
  for (const file of [
    new File(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'], "fake.png", { type: "image/png" }),
    new File(["not an image"], "broken.webp", { type: "image/webp" }),
    new File([], "empty.jpg", { type: "image/jpeg" }),
    new File(["gif"], "photo.gif", { type: "image/gif" }),
  ]) {
    const result = await readMenuImage(request(file)) as Response;
    expect(result.status).toBe(422);
    expect((await result.json()).error.code).toBe("INVALID_IMAGE");
  }
  const large = await readMenuImage(request(new File([new Uint8Array(MAX_MENU_IMAGE_BYTES + 1)], "large.png", { type: "image/png" }))) as Response;
  expect(large.status).toBe(413);
  const chunked = new Request("http://localhost/upload", { method: "POST", body: new Uint8Array(MAX_MENU_IMAGE_BYTES + 65 * 1024), headers: { "Content-Type": "multipart/form-data; boundary=test" } });
  expect((await readMenuImage(chunked) as Response).status).toBe(413);
});

it("signs only the configured private menu object with server credentials", async () => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-access-key"); vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("AWS_REGION", "ap-southeast-1"); vi.stubEnv("AWS_ENDPOINT_URL_S3", "https://storage.example.test/");
  const fetch = vi.fn(async (signed: Request) => {
    expect(signed.url).toBe("https://storage.example.test/images/menus/11111111-1111-4111-8111-111111111111.webp");
    expect(signed.headers.get("authorization")).toContain("AWS4-HMAC-SHA256 Credential=test-access-key/");
    expect(signed.headers.get("content-type")).toBe("image/webp");
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  expect((await menuImageObject("11111111-1111-4111-8111-111111111111", { method: "PUT", body: new Uint8Array([1]), headers: { "Content-Type": "image/webp" } })).status).toBe(200);
  expect(fetch).toHaveBeenCalledOnce();
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
  expect(() => menuImageObject("11111111-1111-4111-8111-111111111111")).toThrow("not configured");
});
