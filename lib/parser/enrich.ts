// lib/parser/enrich.ts
import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedEmail } from "./extract";
import type { ParsedPromotion, RawImage, PromotionImage } from "../types";

const client = new Anthropic();

// ─── Helpers ───────────────────────────────────────────────────────────────

// Extract the first complete JSON object from Claude's response.
// Handles fences, preamble text, and trailing commentary — much more robust
// than stripping fences, and survives partial truncation at the end.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJSON(raw: string): any {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new SyntaxError(`No JSON object found in response: ${raw.slice(0, 100)}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

// ─── Shared Claude call ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a promotions data extractor.
Given promotion content, extract structured data and return ONLY valid JSON.
No explanation, no markdown, no code fences. Just the raw JSON object.`;

const JSON_SHAPE = `{
  "title": "short punchy headline for the promotion (max 10 words). NEVER null — if no clear offer, summarise the topic instead",
  "description": "one sentence describing what the offer is",
  "discount_text": "the discount expressed simply e.g. '30% off', '$20 off orders over $100', or null if no clear discount",
  "promo_code": "the promo code if present e.g. 'SUMMER25', or null",
  "category": "one of: fashion, food, tech, travel, beauty, home, sports, entertainment, finance, other",
  "expiry_date": "ISO date string if mentioned e.g. '2025-04-30', or null",
  "relevance_score": a number 1-10 where 10 = exceptional deal clearly communicated, 1 = vague/no clear offer
}`;

async function callClaude(userPrompt: string): Promise<Record<string, unknown> | null> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  const raw = response.content[0];
  if (raw.type !== "text") return null;
  return parseJSON(raw.text);
}

// ─── Email enrichment ──────────────────────────────────────────────────────

export async function enrichWithClaude(
  email: ExtractedEmail
): Promise<ParsedPromotion | null> {
  try {
    const prompt = `Extract promotion data from this marketing email.

Brand (from sender): ${email.brandName}
Domain: ${email.brandDomain}
Subject: ${email.subject}
Email text:
---
${email.cleanText}
---

Return a JSON object with exactly these fields:
${JSON_SHAPE}`;

    const parsed = await callClaude(prompt);
    if (!parsed) return null;

    const title =
      (parsed.title as string | null) ||
      email.subject.slice(0, 60) ||
      email.brandName;

    return {
      source_email_id: email.emailId,
      brand_name: email.brandName,
      brand_domain: email.brandDomain,
      title,
      description: (parsed.description as string) ?? "",
      discount_text: (parsed.discount_text as string | null) ?? null,
      promo_code: (parsed.promo_code as string | null) ?? null,
      category: (parsed.category as string) ?? "other",
      expiry_date: (parsed.expiry_date as string | null) ?? null,
      relevance_score: (parsed.relevance_score as number) ?? 1,
      raw_text: email.cleanText,
      source: "email",
      click_url: null,
    };
  } catch (err) {
    console.error(`Enrichment failed for ${email.brandName}:`, err);
    return null;
  }
}

// ─── Web scrape enrichment ─────────────────────────────────────────────────

export interface ScrapedItem {
  brandName: string;
  brandDomain: string;
  rawText: string; // scraped text of the sale item
  clickUrl: string; // the page URL this item was scraped from
}

export async function enrichScrapedItem(
  item: ScrapedItem
): Promise<ParsedPromotion | null> {
  try {
    const prompt = `Extract promotion data from this sale item scraped from a retail website.

Brand: ${item.brandName}
Domain: ${item.brandDomain}
Scraped content:
---
${item.rawText}
---

Return a JSON object with exactly these fields:
${JSON_SHAPE}`;

    const parsed = await callClaude(prompt);
    if (!parsed) return null;

    const title =
      (parsed.title as string | null) ||
      item.brandName;

    return {
      // Hash the raw text to get a stable, unique ID per item — avoids
      // duplicate key violations when multiple items are processed in the same ms
      source_email_id: `web_${item.brandDomain}_${Buffer.from(item.rawText.slice(0, 200)).toString("base64").slice(0, 32)}`,
      brand_name: item.brandName,
      brand_domain: item.brandDomain,
      title,
      description: (parsed.description as string) ?? "",
      discount_text: (parsed.discount_text as string | null) ?? null,
      promo_code: (parsed.promo_code as string | null) ?? null,
      category: (parsed.category as string) ?? "other",
      expiry_date: (parsed.expiry_date as string | null) ?? null,
      relevance_score: (parsed.relevance_score as number) ?? 1,
      raw_text: item.rawText.slice(0, 3000),
      source: "web",
      click_url: item.clickUrl,
    };
  } catch (err) {
    console.error(`Web enrichment failed for ${item.brandDomain}:`, err);
    return null;
  }
}

// ─── Image enrichment ──────────────────────────────────────────────────────

const IMAGE_SYSTEM_PROMPT = `You are a promotional image analyzer.
Given an image from a marketing email, extract structured data and return ONLY valid JSON.
No explanation, no markdown, no code fences. Just the raw JSON object.`;

const IMAGE_PROMPT = `Analyze this promotional email image.

Return a JSON object with exactly these fields:
{
  "description": "one sentence describing what's in the image (max 20 words)",
  "tags": ["tag1", "tag2"],
  "has_text": true or false,
  "extracted_text": "any promo codes, prices, discount percentages, or headlines visible in the image, or null"
}

For "tags", choose any that apply (use exact strings):
hero_banner, product_shot, lifestyle_photo, logo, discount_text, promo_code,
seasonal, sale, new_arrival, apparel, electronics, food, beauty, home, travel,
model_wearing, flat_lay, infographic`;

export async function enrichImagesWithClaude(
  promotionId: string,
  images: Array<RawImage & {
    storage_path: string;
    public_url: string;
    mime_type: string;
    file_size_bytes: number;
    width: number;
    height: number;
  }>
): Promise<PromotionImage[]> {
  const results: PromotionImage[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    try {
      const response = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 500,
        system: IMAGE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: img.public_url } },
              { type: "text", text: IMAGE_PROMPT },
            ],
          },
        ],
      });

      const raw = response.content[0];
      const parsed = raw.type === "text" ? parseJSON(raw.text) : {};

      results.push({
        promotion_id: promotionId,
        original_url: img.originalUrl,
        storage_path: img.storage_path,
        public_url: img.public_url,
        role: img.role,
        width: img.width,
        height: img.height,
        mime_type: img.mime_type,
        file_size_bytes: img.file_size_bytes,
        sort_order: i,
        ai_description: parsed.description ?? "",
        ai_tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        has_text: Boolean(parsed.has_text),
        extracted_text: parsed.extracted_text ?? null,
      });
    } catch (err) {
      console.error(`Image enrichment failed for ${img.public_url}:`, err);
    }
  }

  return results;
}