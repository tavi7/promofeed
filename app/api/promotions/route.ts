// app/api/promotions/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const exclude = (searchParams.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let query = supabase
    .from("promotions")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (exclude.length > 0) {
    query = query.not("brand_name", "in", `(${exclude.map((b) => `"${b}"`).join(",")})`);
  }

  const { data: promotions, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!promotions?.length) return NextResponse.json({ promotions: [] });

  // Fetch all images for this page in one query — no N+1
  const ids = promotions.map((p) => p.id);
  const { data: images } = await supabase
    .from("promotion_images")
    .select("promotion_id, public_url, role, sort_order, file_size_bytes, width, height")
    .in("promotion_id", ids);

  // Group and sort images per promotion by role priority
  const promoImages: Record<string, string[]> = {};
  if (images) {
    const grouped: Record<
      string,
      Array<{ url: string; priority: number; sort_order: number }>
    > = {};

    for (const img of images) {
      const priority = ROLE_PRIORITY[img.role] ?? 5;
      if (priority === 99) continue;
      if ((img.file_size_bytes ?? 0) < 2_000) continue;
      if ((img.width ?? 0) < 80 || (img.height ?? 0) < 80) continue;

      if (!grouped[img.promotion_id]) grouped[img.promotion_id] = [];
      grouped[img.promotion_id].push({ url: img.public_url, priority, sort_order: img.sort_order });
    }

    for (const id of Object.keys(grouped)) {
      promoImages[id] = grouped[id]
        .sort((a, b) => a.priority - b.priority || a.sort_order - b.sort_order)
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
