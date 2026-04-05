// app/api/promotions/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use the service-role key server-side only — never exposed to the client.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAGE_SIZE = 50;

export async function GET() {
  const { data, error } = await supabase
    .from("promotions")
    .select(
      "id, brand_name, brand_domain, title, description, discount_text, promo_code, category, expiry_date, relevance_score, click_url, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    console.error("Promotions fetch error:", error.message);
    return NextResponse.json({ error: "Failed to fetch promotions" }, { status: 500 });
  }

  return NextResponse.json(data);
}