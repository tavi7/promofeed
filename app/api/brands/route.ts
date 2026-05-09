// app/api/brands/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/brands         → list all distinct brands
// GET /api/brands?name=X  → check if brand exists
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (name) {
    const { data } = await supabase
      .from("promotions")
      .select("brand_name")
      .ilike("brand_name", `%${name.trim()}%`)
      .limit(1);
    return NextResponse.json({ exists: (data?.length ?? 0) > 0 });
  }

  const { data, error } = await supabase
    .from("promotions")
    .select("brand_name, brand_domain")
    .order("brand_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seen = new Set<string>();
  const brands: { name: string; domain: string }[] = [];
  for (const row of data ?? []) {
    if (!seen.has(row.brand_domain)) {
      seen.add(row.brand_domain);
      brands.push({ name: row.brand_name, domain: row.brand_domain });
    }
  }

  return NextResponse.json({ brands });
}

// POST /api/brands  { name: "Zara" }
// → sends an email notification, nothing else
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ ok: false }, { status: 400 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "PromoFeed <onboarding@resend.dev>",
      to: "roypromo7@gmail.com",
      subject: `PromoFeed — new brand request: ${name}`,
      text: `Someone requested "${name}" be added to PromoFeed.`,
    }),
  });

  if (!res.ok) {
    console.error("Resend error:", await res.text());
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}