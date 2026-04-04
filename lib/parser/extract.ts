// lib/parser/extract.ts
import * as cheerio from "cheerio";
import type { RawEmail } from "../types";

// Patterns that reliably indicate promo content worth keeping
const DISCOUNT_PATTERNS = [
  /\d+%\s*off/gi,
  /save\s+\$?\d+/gi,
  /\$\d+\s*off/gi,
  /free\s+shipping/gi,
  /buy\s+\d+\s+get\s+\d+/gi,
  /[A-Z0-9]{4,12}/g, // promo codes (e.g. SUMMER25, TAKE20)
];

function extractBrandDomain(from: string): string {
  // "H&M <news@hm.com>" → "hm.com"
  const match = from.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!match) return "";
  // Strip mail. / email. / news. subdomains to get root domain
  return match[1].replace(/^(mail|email|news|info|offers|promo)\./i, "");
}

function extractBrandName(from: string, domain: string): string {
  // "H&M <news@hm.com>" → "H&M"
  const displayName = from.match(/^(.+?)\s*</)?.[1]?.trim();
  if (displayName) return displayName.replace(/"/g, "");
  // Fall back to capitalised domain root
  return domain.split(".")[0].replace(/[-_]/g, " ");
}

function htmlToCleanText(html: string): string {
  if (!html) return "";

  const $ = cheerio.load(html);

  // Remove noise elements entirely
  $("script, style, head, nav, footer, img, svg, [role='navigation']").remove();
  $("[style*='display:none'], [style*='display: none']").remove();
  $(".preheader, .hidden, .visually-hidden").remove();

  // Get text, collapse whitespace
  const raw = $.root().text();
  return raw
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3000); // Cap at 3000 chars — enough context, not too many tokens
}

export interface ExtractedEmail {
  emailId: string;
  brandName: string;
  brandDomain: string;
  subject: string;
  cleanText: string;
  date: string;
}

export function extractFromEmail(email: RawEmail): ExtractedEmail {
  const brandDomain = extractBrandDomain(email.from);
  const brandName = extractBrandName(email.from, brandDomain);

  // Prefer HTML body for richness, fall back to plain text
  const source = email.htmlBody || email.textBody;
  const cleanText = htmlToCleanText(source);

  return {
    emailId: email.id,
    brandName,
    brandDomain,
    subject: email.subject,
    cleanText,
    date: email.date,
  };
}