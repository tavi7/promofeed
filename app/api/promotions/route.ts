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

// ─── Image relevance ───────────────────────────────────────────────────────
// Score how well an image matches its promotion's title/description/category.
// Returns 0–1. Images scoring below RELEVANCE_THRESHOLD are rejected.

const RELEVANCE_THRESHOLD = 0.15;

// Keywords per category — used to sanity-check "lifestyle" images
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  fashion:       ["apparel", "clothing", "wear", "fashion", "outfit", "shirt", "dress", "jacket", "shoes", "bag", "model_wearing", "flat_lay"],
  food:          ["food", "drink", "coffee", "tea", "wine", "beer", "meal", "restaurant", "eat", "beverage", "cup", "mug", "nespresso", "espresso", "capsule"],
  tech:          ["tech", "phone", "laptop", "computer", "device", "gadget", "electronics", "screen", "cable", "headphone"],
  travel:        ["travel", "hotel", "flight", "luggage", "destination", "beach", "city", "trip", "vacation"],
  beauty:        ["beauty", "skincare", "makeup", "cosmetic", "hair", "fragrance", "perfume", "cream", "lotion"],
  home:          ["home", "furniture", "decor", "kitchen", "bed", "sofa", "lamp", "rug", "pillow"],
  sports:        ["sport", "fitness", "gym", "running", "yoga", "athletic", "exercise", "workout"],
  entertainment: ["entertainment", "game", "movie", "music", "book", "show", "streaming"],
  finance:       ["finance", "bank", "money", "card", "invest", "insurance"],
};

// Disqualifying tags — images with these are very unlikely to be relevant
// to ANY promotion unless the category explicitly allows it
const LIFESTYLE_TAGS = new Set(["lifestyle_photo"]);
const DISQUALIFY_TAGS = new Set(["logo"]); // logos go in avatar, not card image

function scoreImageRelevance(
  img: { role: string; ai_description: string; ai_tags: string[] },
  promo: { title: string; description: string; category: string; brand_name: string }
): number {
  let score = 0;

  // Hard disqualify logos
  if (DISQUALIFY_TAGS.has(img.role)) return 0;
  if (img.ai_tags.includes("logo")) return 0;

  // Role bonus — product shots are almost always relevant
  if (img.role === "product") score += 0.4;
  else if (img.role === "hero") score += 0.2;
  else if (img.role === "banner") score += 0.1;

  // Build a bag of words from promo context
  const promoWords = [promo.title, promo.description, promo.brand_name, promo.category]
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);

  const imgText = (img.ai_description ?? "").toLowerCase();
  const imgTags = img.ai_tags.map((t) => t.toLowerCase());

  // Word overlap between promo text and image description
  const descriptionMatches = promoWords.filter(
    (w) => imgText.includes(w)
  ).length;
  score += Math.min(descriptionMatches * 0.1, 0.3);

  // Category keyword matches in image tags or description
  const catKeywords = CATEGORY_KEYWORDS[promo.category] ?? [];
  const catMatches = catKeywords.filter(
    (k) => imgText.includes(k) || imgTags.includes(k)
  ).length;
  score += Math.min(catMatches * 0.15, 0.3);

  // Penalise pure lifestyle photos that have no category/promo keyword match
  if (LIFESTYLE_TAGS.has(img.role) || imgTags.includes("lifestyle_photo")) {
    if (catMatches === 0 && descriptionMatches === 0) {
      score -= 0.4; // heavy penalty — wine photo on coffee promo, etc.
    }
  }

  return score;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit  = Math.min(parseInt(searchParams.get("limit")  ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const source = searchParams.get("source"); // "email" | "web" | null

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
    .select("promotion_id, public_url, role, sort_order, ai_description, ai_tags")
    .in("promotion_id", ids);

  // Pick best *relevant* image per promotion
  const bestImage: Record<string, { url: string; priority: number; sort_order: number; relevance: number }> = {};

  if (images) {
    // Build a quick promo lookup
    const promoMap = Object.fromEntries(promotions.map((p) => [p.id, p]));

    for (const img of images) {
      const priority = ROLE_PRIORITY[img.role] ?? 5;
      if (priority === 99) continue; // skip logos entirely

      const promo = promoMap[img.promotion_id];
      if (!promo) continue;

      const relevance = scoreImageRelevance(
        {
          role: img.role,
          ai_description: img.ai_description ?? "",
          ai_tags: Array.isArray(img.ai_tags) ? img.ai_tags : [],
        },
        {
          title: promo.title ?? "",
          description: promo.description ?? "",
          category: promo.category ?? "other",
          brand_name: promo.brand_name ?? "",
        }
      );

      // Skip images that are clearly irrelevant
      if (relevance < RELEVANCE_THRESHOLD) continue;

      const current = bestImage[img.promotion_id];
      if (
        !current ||
        // Prefer higher relevance first, then role priority as tiebreaker
        relevance > current.relevance + 0.05 ||
        (Math.abs(relevance - current.relevance) <= 0.05 && priority < current.priority) ||
        (priority === current.priority && img.sort_order < current.sort_order)
      ) {
        bestImage[img.promotion_id] = { url: img.public_url, priority, sort_order: img.sort_order, relevance };
      }
    }
  }

  const result = promotions.map((p) => ({
    ...p,
    best_image_url: bestImage[p.id]?.url ?? null,
  }));

  return NextResponse.json({ promotions: result });
}