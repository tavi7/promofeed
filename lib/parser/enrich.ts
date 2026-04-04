// lib/parser/enrich.ts
import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedEmail } from "./extract";
import type { ParsedPromotion } from "../types";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a promotions data extractor. 
Given the text of a marketing email, extract structured data and return ONLY valid JSON.
No explanation, no markdown, no code fences. Just the raw JSON object.`;

function buildPrompt(email: ExtractedEmail): string {
  return `Extract promotion data from this marketing email.

Brand (from sender): ${email.brandName}
Domain: ${email.brandDomain}
Subject: ${email.subject}
Email text:
---
${email.cleanText}
---

Return a JSON object with exactly these fields:
{
  "title": "short punchy headline for the promotion (max 10 words)",
  "description": "one sentence describing what the offer is",
  "discount_text": "the discount expressed simply e.g. '30% off', '$20 off orders over $100', or null if no clear discount",
  "promo_code": "the promo code if present e.g. 'SUMMER25', or null",
  "category": "one of: fashion, food, tech, travel, beauty, home, sports, entertainment, finance, other",
  "expiry_date": "ISO date string if mentioned e.g. '2025-04-30', or null",
  "relevance_score": a number 1-10 where 10 = exceptional deal clearly communicated, 1 = vague/spammy with no clear offer
}`;
}

export async function enrichWithClaude(
  email: ExtractedEmail
): Promise<ParsedPromotion | null> {
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(email) }],
    });

    const raw = response.content[0];
    if (raw.type !== "text") return null;

    const parsed = JSON.parse(raw.text);

    return {
      source_email_id: email.emailId,
      brand_name: email.brandName,
      brand_domain: email.brandDomain,
      title: parsed.title,
      description: parsed.description,
      discount_text: parsed.discount_text,
      promo_code: parsed.promo_code,
      category: parsed.category,
      expiry_date: parsed.expiry_date,
      relevance_score: parsed.relevance_score,
      raw_text: email.cleanText,
    };
  } catch (err) {
    console.error(`Enrichment failed for ${email.brandName}:`, err);
    return null;
  }
}