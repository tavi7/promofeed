// lib/parser/imageFilters.ts
//
// Centralized image quality and shape guards shared across the pipeline
// (uploadImages.ts) and the serve layer (route.ts).
// Single source of truth for what gets skipped and how images are ranked.

export interface ImageForFilter {
  width?: number | null;
  height?: number | null;
  file_size_bytes?: number | null;
  role?: string | null;
}

/**
 * Returns true if the image should be excluded from storage / serving.
 * Checks run cheapest-first.
 */
export function shouldSkipImage(img: ImageForFilter): boolean {
  // Tracker pixels, empty placeholders, spacer GIFs
  if ((img.file_size_bytes ?? 0) < 2_000) return true;
  if ((img.width ?? 0) < 80 || (img.height ?? 0) < 80) return true;

  // CTA button strips — extremely wide relative to height.
  // e.g. "SHOP MEN'S" at ~600×60px → ratio 10.  "BUY NOW" button → ratio 4+.
  // Real product/hero images are never this shape.
  const w = img.width ?? 0;
  const h = img.height ?? 0;
  if (h > 0 && w / h > 3.5) return true;

  // Roles that are decorative / navigational — not card content
  if (img.role === "logo" || img.role === "cta") return true;

  return false;
}

/**
 * Role priority for sorting card images — lower number = shown first.
 * 99 = never shown as a card image.
 */
export const ROLE_PRIORITY: Record<string, number> = {
  product: 0,
  hero:    1,
  banner:  2,
  other:   3,
  logo:    99,
  cta:     99,
};