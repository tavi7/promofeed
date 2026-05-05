// lib/supabase/uploadImages.ts
import sharp from "sharp";
import { supabase } from "./client";
import type { RawImage } from "../types";

const BUCKET = "promotions";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB hard cap
const MIN_IMAGE_BYTES = 2 * 1024;         // 2KB — anything smaller is a tracker/spacer
const TIMEOUT_MS = 8000;

export type UploadedImage = RawImage & {
  storage_path: string;
  public_url: string;
  mime_type: string;
  file_size_bytes: number;
  width: number;
  height: number;
};

async function fetchImageBuffer(
  url: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "PromoFeed/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.split(";")[0].trim();
    if (!mimeType.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    const byteLength = arrayBuffer.byteLength;

    if (byteLength > MAX_IMAGE_BYTES) {
      console.warn(`  ✗ Skipping image (too large: ${byteLength}b): ${url.slice(0, 80)}`);
      return null;
    }

    if (byteLength < MIN_IMAGE_BYTES) {
      console.warn(`  ✗ Skipping image (too small: ${byteLength}b — likely tracker/spacer): ${url.slice(0, 80)}`);
      return null;
    }

    return { buffer: Buffer.from(arrayBuffer), mimeType };
  } catch {
    return null;
  }
}

export async function uploadImages(
  promotionId: string,
  images: RawImage[]
): Promise<UploadedImage[]> {
  const results: UploadedImage[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    const fetched = await fetchImageBuffer(img.originalUrl);
    if (!fetched) {
      console.warn(`  Skipping image (fetch failed or filtered): ${img.originalUrl.slice(0, 80)}`);
      continue;
    }

    // Get real dimensions via sharp (more reliable than HTML attributes)
    let width = img.width ?? 0;
    let height = img.height ?? 0;
    try {
      const meta = await sharp(fetched.buffer).metadata();
      width = meta.width ?? width;
      height = meta.height ?? height;
    } catch {
      // fall back to HTML attributes
    }

    // Skip degenerate dimensions even if file size passed — 1×1 PNGs can be >2KB
    if (width > 0 && height > 0 && (width <= 10 || height <= 10)) {
      console.warn(`  ✗ Skipping image (degenerate dimensions ${width}×${height}): ${img.originalUrl.slice(0, 80)}`);
      continue;
    }

    const ext = fetched.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const storage_path = `${promotionId}/${i}_${img.role}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storage_path, fetched.buffer, {
        contentType: fetched.mimeType,
        upsert: true,
      });

    if (error) {
      console.error(`  Storage upload failed for ${storage_path}:`, error.message);
      continue;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storage_path);

    results.push({
      ...img,
      width,
      height,
      storage_path,
      public_url: data.publicUrl,
      mime_type: fetched.mimeType,
      file_size_bytes: fetched.buffer.byteLength,
    });
  }

  return results;
}