// lib/supabase/insert.ts
import { supabase } from "./client";
import type { ParsedPromotion } from "../types";

export async function insertPromotion(
  promo: ParsedPromotion
): Promise<{ inserted: boolean; reason?: string }> {
  // Dedup: source_email_id is UNIQUE in the schema — this handles exact dupes
  const { error } = await supabase
    .from("promotions")
    .insert(promo)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      // Postgres unique violation — already processed this email
      return { inserted: false, reason: "duplicate" };
    }
    throw error;
  }

  return { inserted: true };
}