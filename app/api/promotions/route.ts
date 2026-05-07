// app/api/promotions/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Server-side only — service role key is never sent to the browser
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// product first — we want to show what's on sale, not a generic brand banner.
// logo is excluded entirely — it's used for the avatar, not the card image.
const ROLE_PRIORITY: Record<string, number> = {
  product: 0,
  hero:    1,
  banner:  2,
  other:   3,
  logo:    99, // never shown as card image
};

// Time decay: rank = relevance_score * 0.5^(ageHours / HALF_LIFE_HOURS)
// 24h half-life means a score-8 from yesterday ranks equal to a score-4 from now.
const HALF_LIFE_HOURS = 24;

// Re-rank a wider pool than the page size so pagination stays stable.
// At limit=20, this fetches up to 200 rows for a re-ranked window.
const POOL_MULTIPLIER = 5;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  // Fetch a pool of recent promotions, ordered by recency.
  // We re-rank in JS using a time-decayed score, then slice for pagination.
  const poolEnd = (offset + limit) * POOL_MULTIPLIER - 1;
  const { data: promotions, error } = await supabase
    .from("promotions")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, poolEnd);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!promotions?.length) return NextResponse.json({ promotions: [] });

  // Fetch all images for this pool in one query — no N+1
  const ids = promotions.map((p) => p.id);
  const { data: images } = await supabase
    .from("promotion_images")
    .select("promotion_id, public_url, role, sort_order")
    .in("promotion_id", ids);

  // Pick the best image per promotion
  const bestImage: Record<string, { url: string; priority: number; sort_order: number }> = {};
  if (images) {
    for (const img of images) {
      const priority = ROLE_PRIORITY[img.role] ?? 5;
      if (priority === 99) continue; // skip logos
      const current = bestImage[img.promotion_id];
      if (
        !current ||
        priority < current.priority ||
        (priority === current.priority && img.sort_order < current.sort_order)
      ) {
        bestImage[img.promotion_id] = { url: img.public_url, priority, sort_order: img.sort_order };
      }
    }
  }

  // Compute decayed rank, attach best image, sort descending by rank.
  const now = Date.now();
  const ranked = promotions
    .map((p) => {
      const ageH = (now - new Date(p.created_at).getTime()) / 3_600_000;
      const decay = Math.pow(0.5, ageH / HALF_LIFE_HOURS);
      return {
        ...p,
        best_image_url: bestImage[p.id]?.url ?? null,
        _rank: (p.relevance_score ?? 5) * decay,
      };
    })
    .sort((a, b) => b._rank - a._rank);

  // Paginate after re-ranking
  const paged = ranked.slice(offset, offset + limit);

  // Strip internal _rank field before returning
  const result = paged.map(({ _rank, ...rest }) => rest);

  return NextResponse.json({ promotions: result });
}