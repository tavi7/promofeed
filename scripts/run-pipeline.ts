// scripts/run-pipeline.ts
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { fetchUnreadPromoEmails } from "../lib/gmail/fetch";
import { extractFromEmail } from "../lib/parser/extract";
import { enrichWithClaude } from "../lib/parser/enrich";
import { insertPromotion } from "../lib/supabase/insert";

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
    if (result.inserted) {
      console.log(`  ✓ Inserted: ${enriched.title} (score: ${enriched.relevance_score})`);
      inserted++;
    } else {
      console.log(`  — Skipped: ${result.reason}`);
      skipped++;
    }
  }

  console.log(`\nDone. Inserted: ${inserted} | Skipped: ${skipped} | Failed: ${failed}`);
}

main().catch(console.error);