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
  logo:    99, // never shown — Clearbit handles the brand avatar
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const exclude = (searchParams.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log("[PF api] /api/promotions", { limit, offset, exclude });

  let query = supabase
    .from("promotions")
    .select("*")
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false });

  for (const d of exclude) {
    query = query.neq("brand_domain", d);
    query = query.not("brand_domain", "like", `%.${d}`);
  }

  query = query.range(offset, offset + limit - 1);

  const { data: promotions, error } = await query;

  if (error) {
    console.error("[PF api] supabase error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!promotions?.length) {
    console.log("[PF api] no rows", { offset, limit, exclude });
    return NextResponse.json({ promotions: [] });
  }

  console.log("[PF api] returned", { count: promotions.length, offset });

  // Fetch all images for this page in one query — no N+1
  const ids = promotions.map((p) => p.id);
  const { data: rawImages } = await supabase
    .from("promotion_images")
    .select("promotion_id, public_url, role, sort_order")
    .in("promotion_id", ids);

  // Group images per promotion, skip logos, sort by role priority then sort_order
  const imagesByPromo: Record<
    string,
    Array<{ url: string; role: string; sort_order: number }>
  > = {};

  for (const img of rawImages ?? []) {
    if ((ROLE_PRIORITY[img.role] ?? 5) === 99) continue; // skip logos
    if (!imagesByPromo[img.promotion_id]) imagesByPromo[img.promotion_id] = [];
    imagesByPromo[img.promotion_id].push({
      url: img.public_url,
      role: img.role,
      sort_order: img.sort_order,
    });
  }

  for (const id in imagesByPromo) {
    imagesByPromo[id].sort((a, b) => {
      const pa = ROLE_PRIORITY[a.role] ?? 5;
      const pb = ROLE_PRIORITY[b.role] ?? 5;
      if (pa !== pb) return pa - pb;
      return a.sort_order - b.sort_order;
    });
  }

  const result = promotions.map((p) => ({
    ...p,
    images: imagesByPromo[p.id] ?? [],
  }));

  return NextResponse.json({ promotions: result });
}