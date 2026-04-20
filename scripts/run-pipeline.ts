// scripts/run-pipeline.ts
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { fetchUnreadPromoEmails } from "../lib/gmail/fetch";
import { extractFromEmail } from "../lib/parser/extract";
import { enrichWithClaude, enrichImagesWithClaude } from "../lib/parser/enrich";
import { insertPromotion, insertPromotionImages } from "../lib/supabase/insert";
import { uploadImages } from "../lib/supabase/uploadImages";
import type { RawImage } from "../lib/types";

// Only upload the best N images per email — avoids wasting time on icons,
// spacers, and decorative elements that bulk emails contain by the dozen.
const MAX_IMAGES_PER_EMAIL = 3;

// Role priority for picking which images to keep — mirrors the API route logic
const ROLE_PRIORITY: Record<RawImage["role"], number> = {
  product: 0,
  hero:    1,
  banner:  2,
  other:   3,
  logo:    4,
};

function topImages(images: RawImage[], max: number): RawImage[] {
  return [...images]
    .sort((a, b) => (ROLE_PRIORITY[a.role] ?? 5) - (ROLE_PRIORITY[b.role] ?? 5))
    .slice(0, max);
}

async function main() {
  console.log("🔍 Fetching unread promo emails...");
  const emails = await fetchUnreadPromoEmails(20);
  console.log(`Found ${emails.length} emails\n`);

  let inserted = 0, skipped = 0, failed = 0;

  for (const email of emails) {
    console.log(`Processing: ${email.from} — "${email.subject}"`);

    const extracted = extractFromEmail(email);
    const enriched = await enrichWithClaude(extracted);

    if (!enriched) { failed++; continue; }

    const result = await insertPromotion(enriched);

    if (!result.inserted) {
      console.log(`  — Skipped: ${result.reason}`);
      skipped++;
      continue;
    }

    console.log(`  ✓ Inserted: ${enriched.title} (score: ${enriched.relevance_score})`);
    inserted++;

    // Cap images before uploading — take top 3 by role priority
    const candidateImages = topImages(extracted.rawImages, MAX_IMAGES_PER_EMAIL);

    if (candidateImages.length > 0) {
      console.log(`  🖼  Processing ${candidateImages.length}/${extracted.rawImages.length} image(s)...`);
      try {
        const uploaded = await uploadImages(result.id!, candidateImages);
        const enrichedImages = await enrichImagesWithClaude(result.id!, uploaded);
        const { inserted: imgCount } = await insertPromotionImages(enrichedImages);
        console.log(`  ✓ Saved ${imgCount} image(s)`);
      } catch (err) {
        console.error(`  ⚠ Image pipeline failed:`, err);
      }
    }
  }

  console.log(`\nDone. Inserted: ${inserted} | Skipped: ${skipped} | Failed: ${failed}`);
}

main().catch(console.error);