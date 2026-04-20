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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const { data: promotions, error } = await supabase
    .from("promotions")
    .select("*")
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!promotions?.length) return NextResponse.json({ promotions: [] });

  // Fetch all images for this page in one query — no N+1
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

  const result = promotions.map((p) => ({
    ...p,
    best_image_url: bestImage[p.id]?.url ?? null,
  }));

  return NextResponse.json({ promotions: result });
}