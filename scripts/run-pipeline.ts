// scripts/run-pipeline.ts
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { fetchUnreadPromoEmails } from "../lib/gmail/fetch";
import { extractFromEmail } from "../lib/parser/extract";
import { enrichWithClaude, enrichImagesWithClaude } from "../lib/parser/enrich";
import { insertPromotion, insertPromotionImages } from "../lib/supabase/insert";
import { uploadImages } from "../lib/supabase/uploadImages";

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

    // Image pipeline — runs after promotion is inserted so we have result.id
    if (extracted.rawImages.length > 0) {
      console.log(`  🖼  Processing ${extracted.rawImages.length} image(s)...`);
      try {
        const uploaded = await uploadImages(result.id!, extracted.rawImages);
        const enrichedImages = await enrichImagesWithClaude(result.id!, uploaded);
        const { inserted: imgCount } = await insertPromotionImages(enrichedImages);
        console.log(`  ✓ Saved ${imgCount} image(s)`);
      } catch (err) {
        console.error(`  ⚠ Image pipeline failed:`, err);
        // Non-fatal — promotion is already inserted, images are best-effort
      }
    }
  }

  console.log(`\nDone. Inserted: ${inserted} | Skipped: ${skipped} | Failed: ${failed}`);
}

main().catch(console.error);