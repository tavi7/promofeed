// lib/parser/extract.ts
import * as cheerio from "cheerio";
import type { RawEmail, RawImage } from "../types";

// ─── Promo text patterns ───────────────────────────────────────────────────

const DISCOUNT_PATTERNS = [
  /\d+%\s*off/gi,
  /save\s+\$?\d+/gi,
  /\$\d+\s*off/gi,
  /free\s+shipping/gi,
  /buy\s+\d+\s+get\s+\d+/gi,
  /[A-Z0-9]{4,12}/g,
];

// ─── Brand helpers ─────────────────────────────────────────────────────────

function extractBrandDomain(from: string): string {
  const match = from.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (!match) return "";
  return match[1].replace(/^(mail|email|news|info|offers|promo)\./i, "");
}

function extractBrandName(from: string, domain: string): string {
  const displayName = from.match(/^(.+?)\s*</)?.[1]?.trim();
  if (displayName) return displayName.replace(/"/g, "");
  return domain.split(".")[0].replace(/[-_]/g, " ");
}

// ─── Text extraction ───────────────────────────────────────────────────────

function htmlToCleanText(html: string): string {
  if (!html) return "";

  const $ = cheerio.load(html);

  $("script, style, head, nav, footer, img, svg, [role='navigation']").remove();
  $("[style*='display:none'], [style*='display: none']").remove();
  $(".preheader, .hidden, .visually-hidden").remove();

  const raw = $.root().text();
  return raw
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 3000);
}

// ─── Image extraction ──────────────────────────────────────────────────────

const TRACKING_DOMAINS = [
  "open.convertkit",
  "click.mailchimp",
  "mandrillapp.com",
  "list-manage.com",
  "exacttarget.com",
  "klaviyomail.com",
  "sendgrid.net",
  "pixel.",
  "beacon.",
  "trk.email",
];

const MIN_DIMENSION = 30;

function isTrackingPixel(src: string, width?: number, height?: number): boolean {
  if (width && height && width <= MIN_DIMENSION && height <= MIN_DIMENSION) return true;
  if (TRACKING_DOMAINS.some((d) => src.includes(d))) return true;
  if (src.startsWith("data:image/")) return true;
  return false;
}

function classifyImage(
  index: number,
  src: string,
  altText: string,
  width?: number,
  height?: number
): RawImage["role"] {
  const alt = altText.toLowerCase();
  const srcLower = src.toLowerCase();

  if (
    alt.includes("logo") ||
    srcLower.includes("logo") ||
    srcLower.includes("brand") ||
    (width && height && width <= 300 && height <= 100)
  ) {
    return "logo";
  }

  if (width && height && width > 400 && height < 200) return "banner";
  if (index === 0 && (!width || width >= 400)) return "hero";

  if (
    alt.includes("product") ||
    alt.includes("shop") ||
    srcLower.includes("product") ||
    srcLower.includes("/p/") ||
    srcLower.includes("item")
  ) {
    return "product";
  }

  return "other";
}

const ROLE_ORDER: Record<RawImage["role"], number> = {
  hero: 0,
  banner: 1,
  product: 2,
  other: 3,
  logo: 4,
};

function extractImages(html: string): RawImage[] {
  if (!html) return [];

  const $ = cheerio.load(html);
  const images: RawImage[] = [];

  $("img").each((index, el) => {
    const src = $(el).attr("src") || "";
    if (!src.trim()) return;

    const widthAttr = $(el).attr("width");
    const heightAttr = $(el).attr("height");
    const width = widthAttr ? parseInt(widthAttr, 10) : undefined;
    const height = heightAttr ? parseInt(heightAttr, 10) : undefined;
    const altText = $(el).attr("alt") || "";

    if (isTrackingPixel(src, width, height)) return;

    images.push({
      originalUrl: src,
      role: classifyImage(index, src, altText, width, height),
      width,
      height,
      altText,
    });
  });

  return images.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

// ─── Public interface ──────────────────────────────────────────────────────

export interface ExtractedEmail {
  emailId: string;
  brandName: string;
  brandDomain: string;
  subject: string;
  cleanText: string;
  date: string;
  rawImages: RawImage[];
}

export function extractFromEmail(email: RawEmail): ExtractedEmail {
  const brandDomain = extractBrandDomain(email.from);
  const brandName = extractBrandName(email.from, brandDomain);

  const source = email.htmlBody || email.textBody;

  // Extract images BEFORE htmlToCleanText strips <img> tags
  const rawImages = extractImages(source);
  const cleanText = htmlToCleanText(source);

  return {
    emailId: email.id,
    brandName,
    brandDomain,
    subject: email.subject,
    cleanText,
    date: email.date,
    rawImages,
  };
}