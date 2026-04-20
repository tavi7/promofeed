// app/api/promotions/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Server-side only — service role key is never sent to the browser
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Role priority for picking the "best" image — lower = better
const ROLE_PRIORITY: Record<string, number> = {
  hero: 0,
  banner: 1,
  product: 2,
  other: 3,
  logo: 4,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  // Fetch promotions
  const { data: promotions, error } = await supabase
    .from("promotions")
    .select("*")
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!promotions?.length) return NextResponse.json({ promotions: [] });

  // Fetch all images for this page of promotions in one query
  const ids = promotions.map((p) => p.id);
  const { data: images } = await supabase
    .from("promotion_images")
    .select("promotion_id, public_url, role, sort_order")
    .in("promotion_id", ids);

  // Build a map: promotion_id → best image url
  const bestImage: Record<string, string> = {};
  if (images) {
    for (const img of images) {
      const current = bestImage[img.promotion_id];
      if (!current) {
        bestImage[img.promotion_id] = img.public_url;
      } else {
        // Compare by role priority, then sort_order
        const existing = images.find(
          (i) => i.promotion_id === img.promotion_id && i.public_url === current
        );
        const existingPriority = existing ? (ROLE_PRIORITY[existing.role] ?? 5) : 5;
        const newPriority = ROLE_PRIORITY[img.role] ?? 5;
        if (
          newPriority < existingPriority ||
          (newPriority === existingPriority && img.sort_order < (existing?.sort_order ?? 99))
        ) {
          bestImage[img.promotion_id] = img.public_url;
        }
      }
    }
  }

  // Attach best_image_url to each promotion
  const result = promotions.map((p) => ({
    ...p,
    best_image_url: bestImage[p.id] ?? null,
  }));

  return NextResponse.json({ promotions: result });
}