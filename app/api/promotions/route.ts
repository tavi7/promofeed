// app/api/promotions/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Server-side only — service role key is never sent to the browser
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Lower number = shown first. Logo excluded from card images entirely.
const ROLE_PRIORITY: Record<string, number> = {
  product: 0,
  hero:    1,
  banner:  2,
  other:   3,
  logo:    99,
};

// Quality gates applied at query time — images that fail are silently dropped.
const MIN_FILE_SIZE_BYTES = 2_000;  // <2KB = tracker pixel or corrupt
const MIN_DIMENSION_PX    = 80;     // width or height below this = icon/spacer
const MAX_ASPECT_RATIO    = 3.5;    // width/height above this = CTA banner strip (e.g. "SHOP NOW" buttons)
const MAX_IMAGES_PER_CARD = 5;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  // Brand exclusion — comma-separated list of brand names to hide
  const excludeParam = searchParams.get("exclude") ?? "";
  const excludedBrands = excludeParam
    ? excludeParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Build the promotions query
  let query = supabase
    .from("promotions")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (excludedBrands.length > 0) {
    // Supabase: not.in() on brand_name
    query = query.not("brand_name", "in", `(${excludedBrands.map((b) => `"${b}"`).join(",")})`);
  }

  const { data: promotions, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!promotions?.length) return NextResponse.json({ promotions: [] });

  // Fetch all images for this page in one query — no N+1
  // Also fetch width, height, file_size_bytes for quality filtering
  const ids = promotions.map((p) => p.id);
  const { data: images } = await supabase
    .from("promotion_images")
    .select("promotion_id, public_url, role, sort_order, width, height, file_size_bytes")
    .in("promotion_id", ids);

  // Group images per promotion, apply quality gates, sort, cap at MAX_IMAGES_PER_CARD
  const promoImages: Record<string, string[]> = {};

  if (images) {
    const grouped: Record<
      string,
      Array<{ url: string; priority: number; sort_order: number }>
    > = {};

    for (const img of images) {
      const priority = ROLE_PRIORITY[img.role] ?? 5;

      // Never show logos as card images
      if (priority === 99) continue;

      // Quality gate 1: file too small (tracker pixel / corrupt / placeholder)
      if ((img.file_size_bytes ?? 0) < MIN_FILE_SIZE_BYTES) continue;

      // Quality gate 2: dimensions too small (icon / spacer)
      if ((img.width ?? 0) < MIN_DIMENSION_PX || (img.height ?? 0) < MIN_DIMENSION_PX) continue;

      // Quality gate 3: extreme aspect ratio = CTA banner strip ("SHOP NOW", "SHOP MEN'S" etc.)
      if (img.width && img.height && img.width / img.height > MAX_ASPECT_RATIO) continue;

      if (!grouped[img.promotion_id]) grouped[img.promotion_id] = [];
      grouped[img.promotion_id].push({
        url: img.public_url,
        priority,
        sort_order: img.sort_order,
      });
    }

    for (const id of Object.keys(grouped)) {
      promoImages[id] = grouped[id]
        .sort((a, b) => a.priority - b.priority || a.sort_order - b.sort_order)
        .slice(0, MAX_IMAGES_PER_CARD)
        .map((i) => i.url);
    }
  }

  const result = promotions.map((p) => ({
    ...p,
    all_images:     promoImages[p.id] ?? [],
    best_image_url: promoImages[p.id]?.[0] ?? null,
  }));

  return NextResponse.json({ promotions: result });
}
