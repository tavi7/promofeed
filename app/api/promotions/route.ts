// app/api/promotions/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Prevent Next.js from caching this route — every request hits Supabase fresh
export const dynamic = "force-dynamic";

// Server-side only — service role key is never sent to the browser
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Product-first priority — logo never shown as card image
const ROLE_PRIORITY: Record<string, number> = {
  product: 0,
  hero:    1,
  banner:  2,
  other:   3,
  logo:    99,
};

// How many recent rows to fetch before applying decay re-ranking.
// Fetching by created_at DESC means the pool is always the freshest N items,
// and decay × relevance determines what actually surfaces to the top.
const POOL_MULTIPLIER = 5;

// Score half-life: an item's effective score halves every 24 hours
const HALF_LIFE_HOURS = 24;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const exclude = (searchParams.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Fetch a pool of the most recent rows — newest first, so fresh emails are
  // always candidates regardless of their relevance score
  const poolSize = (offset + limit) * POOL_MULTIPLIER;

  let query = supabase
    .from("promotions")
    .select("*")
    .order("created_at", { ascending: false })
    .range(0, poolSize - 1);

  if (exclude.length > 0) {
    query = query.not("brand_name", "in", `(${exclude.map((b) => `"${b}"`).join(",")})`);
  }

  const { data: rows, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ promotions: [] });

  // Apply time-decay re-ranking: rank = relevance_score × 0.5^(ageHours / 24)
  // This lets a fresh score-7 beat a day-old score-9
  const now = Date.now();
  const ranked = rows
    .map((p) => {
      const ageHours = (now - new Date(p.created_at).getTime()) / 3_600_000;
      const decay    = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
      return { ...p, _rank: (p.relevance_score ?? 5) * decay };
    })
    .sort((a, b) => b._rank - a._rank);

  // Paginate after re-ranking
  const page = ranked.slice(offset, offset + limit);
  if (!page.length) return NextResponse.json({ promotions: [] });

  // Fetch all images for this page in one query — no N+1
  const ids = page.map((p) => p.id);
  const { data: images } = await supabase
    .from("promotion_images")
    .select("promotion_id, public_url, role, sort_order, file_size_bytes, width, height")
    .in("promotion_id", ids);

  // Group images per promotion, sorted by role priority.
  // Also apply the same quality gate as the upload pipeline:
  // skip images that are too small or too tiny on disk.
  const promoImages: Record<string, string[]> = {};
  if (images) {
    const grouped: Record<
      string,
      Array<{ url: string; priority: number; sort_order: number }>
    > = {};

    for (const img of images) {
      const priority = ROLE_PRIORITY[img.role] ?? 5;
      if (priority === 99) continue; // skip logos
      if ((img.file_size_bytes ?? 0) < 2_000) continue; // skip trackers / corrupt
      if ((img.width ?? 0) < 80 || (img.height ?? 0) < 80) continue; // skip icons / spacers

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
        .map((i) => i.url);
    }
  }

  // Strip internal _rank, attach images
  const result = page.map(({ _rank, ...p }) => ({
    ...p,
    all_images:     promoImages[p.id] ?? [],
    best_image_url: promoImages[p.id]?.[0] ?? null, // backward compat
  }));

  return NextResponse.json({ promotions: result });
}
