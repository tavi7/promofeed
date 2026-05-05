// app/api/promotions/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ROLE_PRIORITY: Record<string, number> = {
  product: 0,
  hero:    1,
  banner:  2,
  other:   3,
  logo:    99,
};

// 2KB minimum — same threshold as uploadImages.ts
// Guards against trackers that slipped in before the upload filter was added
const MIN_IMAGE_BYTES = 2 * 1024;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20"), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const source = searchParams.get("source"); // "email" | "web" | null (= all)

  let query = supabase
    .from("promotions")
    .select("*")
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (source === "email" || source === "web") {
    query = query.eq("source", source);
  }

  const { data: promotions, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!promotions?.length) return NextResponse.json({ promotions: [] });

  const ids = promotions.map((p) => p.id);
  const { data: images } = await supabase
    .from("promotion_images")
    .select("promotion_id, public_url, role, sort_order, ai_tags, file_size_bytes")
    .in("promotion_id", ids);

  const bestImage: Record<string, string> = {};

  if (images) {
    const byPromotion: Record<string, typeof images> = {};
    for (const img of images) {
      if (!byPromotion[img.promotion_id]) byPromotion[img.promotion_id] = [];
      byPromotion[img.promotion_id].push(img);
    }

    for (const [promoId, imgs] of Object.entries(byPromotion)) {
      // Hard filter: no logos, no tiny images
      const eligible = imgs.filter(
        (img) =>
          ROLE_PRIORITY[img.role] !== 99 &&
          (img.file_size_bytes == null || img.file_size_bytes >= MIN_IMAGE_BYTES)
      );

      if (eligible.length === 0) continue;

      // Prefer images Claude approved for the feed
      const feedWorthy = eligible.filter(
        (img) => Array.isArray(img.ai_tags) && img.ai_tags.includes("show_in_feed")
      );

      const candidates = feedWorthy.length > 0 ? feedWorthy : eligible;

      candidates.sort((a, b) => {
        const pa = ROLE_PRIORITY[a.role] ?? 5;
        const pb = ROLE_PRIORITY[b.role] ?? 5;
        if (pa !== pb) return pa - pb;
        return a.sort_order - b.sort_order;
      });

      bestImage[promoId] = candidates[0].public_url;
    }
  }

  const result = promotions.map((p) => ({
    ...p,
    best_image_url: bestImage[p.id] ?? null,
  }));

  return NextResponse.json({ promotions: result });
}