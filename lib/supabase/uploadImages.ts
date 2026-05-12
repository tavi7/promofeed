// lib/supabase/uploadImages.ts
import sharp from "sharp";
import { supabase } from "./client";
import type { RawImage } from "../types";

const BUCKET = "promotions";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB cap
const MIN_IMAGE_BYTES = 2048;            // < 2 KB → tracker pixel or corrupt data
const MIN_DIMENSION  = 100;             // < 100px on either side → too small to be content
const MIN_BRIGHTNESS = 12;              // 0–255 scale; < 12 ≈ nearly black placeholder
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
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) return null;

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
      console.warn(`  ✗ Skipping image (fetch failed): ${img.originalUrl}`);
      continue;
    }

    // ── Guard 1: file too small ──────────────────────────────────────────
    if (fetched.buffer.byteLength < MIN_IMAGE_BYTES) {
      console.warn(`  ✗ Skipping image (file too small: ${fetched.buffer.byteLength}B): ${img.originalUrl}`);
      continue;
    }

    // ── Get real dimensions via sharp ────────────────────────────────────
    let width = img.width ?? 0;
    let height = img.height ?? 0;
    let brightnessOk = true;

    try {
      const meta = await sharp(fetched.buffer).metadata();
      width  = meta.width  ?? width;
      height = meta.height ?? height;

      // ── Guard 2: too small (likely icon / spacer) ──────────────────────
      if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
        console.warn(`  ✗ Skipping image (too small: ${width}×${height}): ${img.originalUrl}`);
        continue;
      }

      // ── Guard 3: near-black image (broken render / dark placeholder) ───
      const stats = await sharp(fetched.buffer)
        .resize(50, 50, { fit: "inside" }) // downsample before stats for speed
        .stats();
      const avgBrightness =
        stats.channels.reduce((sum, ch) => sum + ch.mean, 0) / stats.channels.length;

      if (avgBrightness < MIN_BRIGHTNESS) {
        console.warn(
          `  ✗ Skipping image (too dark: brightness=${avgBrightness.toFixed(1)}): ${img.originalUrl}`
        );
        brightnessOk = false;
      }
    } catch {
      // sharp failure — keep the image; don't drop it over a metadata quirk
    }

    if (!brightnessOk) continue;

    // ── Upload to Supabase Storage ───────────────────────────────────────
    const ext = fetched.mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const storage_path = `${promotionId}/${i}_${img.role}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storage_path, fetched.buffer, {
        contentType: fetched.mimeType,
        upsert: true,
      });

    if (error) {
      console.error(`  ✗ Storage upload failed for ${storage_path}:`, error.message);
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