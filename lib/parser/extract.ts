// lib/parser/extract.ts
import * as cheerio from "cheerio";
import type { RawEmail, RawImage } from "../types";

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

// ─── Click URL extraction ──────────────────────────────────────────────────
//
// Strategy: find the most prominent CTA link in the email HTML.
// We rank <a> tags by a set of signals and return the best candidate.
// Tracking redirects (e.g. click.mailchimp.com) are intentionally kept as-is
// because they are the actual click-through URLs brands use; resolving them
// would require outbound HTTP requests during parsing.

const SKIP_HREF_PATTERNS = [
  /^mailto:/i,
  /^#/,
  /unsubscribe/i,
  /optout/i,
  /opt-out/i,
  /preferences/i,
  /manage.*email/i,
  /privacy.*policy/i,
  /terms.*service/i,
  /^https?:\/\/(www\.)?facebook\.com/i,
  /^https?:\/\/(www\.)?twitter\.com/i,
  /^https?:\/\/(www\.)?instagram\.com/i,
  /^https?:\/\/(www\.)?linkedin\.com/i,
];

const CTA_TEXT_SIGNALS = [
  /shop\s*now/i,
  /buy\s*now/i,
  /order\s*now/i,
  /get\s*(the\s*)?deal/i,
  /claim\s*(your\s*)?offer/i,
  /view\s*(the\s*)?offer/i,
  /see\s*(the\s*)?deal/i,
  /explore\s*now/i,
  /learn\s*more/i,
  /get\s*started/i,
  /redeem/i,
  /save\s*now/i,
  /grab\s*(the\s*)?deal/i,
];

function scoreAnchor($el: cheerio.Cheerio<cheerio.Element>, $: cheerio.CheerioAPI): number {
  let score = 0;
  const text = ($el.text() || "").trim();
  const href = $el.attr("href") || "";

  // CTA language in link text is the strongest signal
  if (CTA_TEXT_SIGNALS.some((re) => re.test(text))) score += 10;

  // Button-like styling
  const style = ($el.attr("style") || "").toLowerCase();
  const cls = ($el.attr("class") || "").toLowerCase();
  if (
    style.includes("background") ||
    style.includes("background-color") ||
    cls.includes("btn") ||
    cls.includes("button") ||
    cls.includes("cta")
  ) {
    score += 5;
  }

  // Parent is a <td> styled as a button (common email pattern)
  const parent = $el.parent();
  const parentStyle = (parent.attr("style") || "").toLowerCase();
  if (parentStyle.includes("background") || parentStyle.includes("background-color")) {
    score += 3;
  }

  // Link wraps an image (hero CTA)
  if ($el.find("img").length > 0) score += 2;

  // Penalise very short or very long link text (nav links, footer links)
  if (text.length < 3 || text.length > 80) score -= 3;

  // Slight preference for links pointing to the brand's own domain
  // (already filtered by SKIP_HREF_PATTERNS above, so this is a bonus)
  if (href.length > 0) score += 1;

  return score;
}

function extractClickUrl(html: string): string | null {
  if (!html) return null;

  const $ = cheerio.load(html);
  let bestHref: string | null = null;
  let bestScore = -Infinity;

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") || "";

    if (!href.startsWith("http")) return;
    if (SKIP_HREF_PATTERNS.some((re) => re.test(href))) return;

    const score = scoreAnchor($(el), $);
    if (score > bestScore) {
      bestScore = score;
      bestHref = href;
    }
  });

  // Only return if we found at least a basic positive score
  return bestScore > 0 ? bestHref : null;
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
  clickUrl: string | null;
  rawImages: RawImage[];
}

export function extractFromEmail(email: RawEmail): ExtractedEmail {
  const brandDomain = extractBrandDomain(email.from);
  const brandName = extractBrandName(email.from, brandDomain);

  const source = email.htmlBody || email.textBody;

  // Extract images and click URL BEFORE htmlToCleanText strips tags
  const rawImages = extractImages(source);
  const clickUrl = extractClickUrl(source);
  const cleanText = htmlToCleanText(source);

  return {
    emailId: email.id,
    brandName,
    brandDomain,
    subject: email.subject,
    cleanText,
    date: email.date,
    clickUrl,
    rawImages,
  };
}