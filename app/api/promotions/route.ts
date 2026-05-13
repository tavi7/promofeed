// app/api/promotions/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ROLE_PRIORITY, shouldSkipImage } from "../../lib/parser/imageFilters";

export const dynamic = "force-dynamic";

// Server-side only — service role key is never sent to the browser
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_IMAGES_PER_CARD = 5;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const exclude = searchParams.get("exclude"); // comma-separated brand names to hide

  let query = supabase
    .from("promotions")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (exclude) {
    const brands = exclude.split(",").map((b) => b.trim()).filter(Boolean);
    if (brands.length > 0) {
      query = query.not("brand_name", "in", `(${brands.map((b) => `"${b}"`).join(",")})`);
    }
  }

  const { data: promotions, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!promotions?.length) return NextResponse.json({ promotions: [] });

  // Fetch all images for this page in one query — no N+1
  const ids = promotions.map((p) => p.id);
  const { data: images } = await supabase
    .from("promotion_images")
    .select("promotion_id, public_url, role, sort_order, width, height, file_size_bytes")
    .in("promotion_id", ids);

  // Group images per promotion, applying quality + shape guards and role priority.
  // shouldSkipImage here acts as a runtime safety net for any images already in the
  // DB that were ingested before the upload-time guards were in place (e.g. old
  // "SHOP MEN" CTA images that were classified as "product" or "banner").
  const promoImages: Record<string, string[]> = {};
  if (images) {
    const grouped: Record<
      string,
      Array<{ url: string; priority: number; sort_order: number }>
    > = {};

    for (const img of images) {
      // Skip decorative / low-quality / CTA images at serve time
      if (
        shouldSkipImage({
          width: img.width,
          height: img.height,
          file_size_bytes: img.file_size_bytes,
          role: img.role,
        })
      ) {
        continue;
      }

      const priority = ROLE_PRIORITY[img.role] ?? 3;
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
