import { afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { readMenuImage, menuImageObject, listMenuImages } from "./menu-image-storage";
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

it("lists every page and ignores unmanaged keys and missing object dates", async () => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key"); vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("AWS_REGION", "ap-southeast-1"); vi.stubEnv("AWS_ENDPOINT_URL_S3", "https://storage.example.test");
  const id = "11111111-1111-4111-8111-111111111111";
  const fetch = vi.fn(async (request: Request) => {
    const url = new URL(request.url);
    expect(url.searchParams.get("prefix")).toBe("menus/");
    if (!url.searchParams.has("continuation-token")) return new Response('<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>menus/unrelated.txt</Key><LastModified>2020-01-01T00:00:00Z</LastModified></Contents><NextContinuationToken>a&amp;b</NextContinuationToken></ListBucketResult>');
    expect(url.searchParams.get("continuation-token")).toBe("a&b");
    return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>menus/${id}.webp</Key><LastModified>2020-01-01T00:00:00Z</LastModified></Contents><Contents><Key>menus/${id}.webp</Key></Contents></ListBucketResult>`);
  });
  vi.stubGlobal("fetch", fetch);
  const images = []; for await (const image of listMenuImages()) images.push(image);
  expect(images).toEqual([{ id, modifiedAt: Date.parse("2020-01-01T00:00:00Z") }]);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("fails closed on malformed or incomplete listings and invalid object IDs", async () => {
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key"); vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
  vi.stubEnv("AWS_REGION", "ap-southeast-1"); vi.stubEnv("AWS_ENDPOINT_URL_S3", "https://storage.example.test");
  for (const xml of ["not xml", "<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>", '<!DOCTYPE test [<!ENTITY x "test">]><ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>']) {
    vi.stubGlobal("fetch", async () => new Response(xml));
    await expect(async () => { for await (const image of listMenuImages()) void image; }).rejects.toThrow();
  }
  expect(() => menuImageObject("../secret", { method: "DELETE" })).toThrow("Invalid menu image ID");
});
