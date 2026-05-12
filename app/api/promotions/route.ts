// app/api/promotions/route.ts
export const dynamic = 'force-dynamic';
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Server-side only — service role key is never sent to the browser
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ROLE_PRIORITY: Record<string, number> = {
  product: 0,
  hero:    1,
  banner:  2,
  other:   3,
  logo:    99, // never shown as card image
};

// Minimum quality thresholds — images below these are excluded at serve-time
// even if they somehow made it into the DB.
const MIN_FILE_BYTES = 2048;
const MIN_DIMENSION  = 80;
const MAX_IMAGES_PER_CARD = 5;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20"), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const source = searchParams.get("source");            // "email" | "web" | null
  const exclude = searchParams.get("exclude")?.split(",").filter(Boolean) ?? [];

  let query = supabase
    .from("promotions")
    .select("*")
    .order("relevance_score", { ascending: false })
    .order("created_at",      { ascending: false })
    .range(offset, offset + limit - 1);

  if (source) query = query.eq("source", source);
  if (exclude.length) query = query.not("brand_name", "in", `(${exclude.join(",")})`);

  const { data: promotions, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!promotions?.length) return NextResponse.json({ promotions: [] });

  // Fetch all images for this page in one query — no N+1.
  // Include width, height, file_size_bytes so we can apply quality filters here.
  const ids = promotions.map((p) => p.id);
  const { data: images } = await supabase
    .from("promotion_images")
    .select("promotion_id, public_url, role, sort_order, width, height, file_size_bytes")
    .in("promotion_id", ids);

  // ── Build per-promotion image lists ─────────────────────────────────────
  //
  // Product-first rule:
  //   If a promotion has ANY product images, show ONLY product images.
  //   Otherwise fall back to hero → banner → other (logos always excluded).
  //
  // Within each role group, images are sorted by sort_order (pipeline order).
  // Final list is capped at MAX_IMAGES_PER_CARD.

  const promoImages: Record<string, string[]> = {};

  if (images) {
    // Group valid images by promotion
    const grouped: Record<
      string,
      Array<{ url: string; role: string; priority: number; sort_order: number }>
    > = {};

    for (const img of images) {
      const priority = ROLE_PRIORITY[img.role] ?? 5;
      if (priority === 99) continue; // skip logos

      // Runtime quality gate — drop images that are too small or too tiny
      if (img.file_size_bytes && img.file_size_bytes < MIN_FILE_BYTES) continue;
      if (img.width  && img.width  < MIN_DIMENSION) continue;
      if (img.height && img.height < MIN_DIMENSION) continue;

      if (!grouped[img.promotion_id]) grouped[img.promotion_id] = [];
      grouped[img.promotion_id].push({
        url: img.public_url,
        role: img.role,
        priority,
        sort_order: img.sort_order,
      });
    }

    for (const id of Object.keys(grouped)) {
      const all = grouped[id];

      // Check if there are any product images
      const productImages = all.filter((img) => img.role === "product");

      // Use product images exclusively if available; otherwise use all (already no logos)
      const candidates = productImages.length > 0 ? productImages : all;

      promoImages[id] = candidates
        .sort((a, b) => a.sort_order - b.sort_order)   // keep pipeline order within role
        .slice(0, MAX_IMAGES_PER_CARD)
        .map((x) => x.url);
    }
  }

  const result = promotions.map((p) => ({
    ...p,
    all_images:     promoImages[p.id] ?? [],
    best_image_url: promoImages[p.id]?.[0] ?? null, // kept for any backward-compat consumers
  }));

  return NextResponse.json({ promotions: result });
}
