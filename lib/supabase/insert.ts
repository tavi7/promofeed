// lib/supabase/insert.ts
import { supabase } from "./client";
import type { ParsedPromotion, PromotionImage } from "../types";

export async function insertPromotion(
  promo: ParsedPromotion
): Promise<{ inserted: boolean; id?: string; reason?: string }> {
  const { data, error } = await supabase
    .from("promotions")
    .insert(promo)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { inserted: false, reason: "duplicate" };
    }
    throw error;
  }

  return { inserted: true, id: data.id };
}

export async function insertPromotionImages(
  images: PromotionImage[]
): Promise<{ inserted: number }> {
  if (images.length === 0) return { inserted: 0 };

  const { error } = await supabase
    .from("promotion_images")
    .upsert(images, { onConflict: "promotion_id, storage_path" });

  if (error) throw error;

  return { inserted: images.length };
}