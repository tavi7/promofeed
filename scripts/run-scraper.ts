// scripts/run-scraper.ts
//
// Scrapes sale sections from hardcoded retail websites using a headless browser.
// A single browser instance is shared across all sites — one tab per site.
//
// Setup (once):
//   npm install playwright
//   npx playwright install chromium
//
// Run from project root:
//   npx ts-node -P tsconfig.scripts.json scripts/run-scraper.ts

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import * as cheerio from "cheerio";
import { chromium, type Browser } from "playwright";
import { enrichScrapedItem, type ScrapedItem } from "../lib/parser/enrich";
import { insertPromotion } from "../lib/supabase/insert";

// ─── Target sites ──────────────────────────────────────────────────────────

const TARGETS = [
  {
    brandName: "Macy's",
    brandDomain: "macys.com",
    url: "https://www.macys.com/shop/sale?id=3536",
    selector: "[data-el='product-thumbnail'], .productThumbnail",
    textSelector: "[data-el='product-description'], [data-el='price-sale'], [data-el='price-regular']",
    waitFor: "[data-el='product-thumbnail'], .productThumbnail",
  },
  {
    brandName: "Uniqlo",
    brandDomain: "uniqlo.com",
    url: "https://www.uniqlo.com/us/en/feature/sale/women",
    selector: "[class*='ProductTile'], [data-testid='product-tile'], .fr-product-tile",
    textSelector: "[class*='productName'], [class*='productPrice'], [class*='discount']",
    waitFor: "[class*='ProductTile'], [data-testid='product-tile']",
  },
  {
    brandName: "ASOS",
    brandDomain: "asos.com",
    url: "https://www.asos.com/women/sale/cat/?cid=8409",
    selector: "article",
    textSelector: "h3, [data-auto-id='productTileDescription'], [data-auto-id='productTilePrice']",
    waitFor: "article",
  },
  {
    brandName: "H&M",
    brandDomain: "hm.com",
    url: "https://www2.hm.com/en_us/sale.html",
    selector: ".product-item, li.product-item",
    textSelector: "h3, .item-heading, .price",
    waitFor: ".product-item",
  },
  {
    brandName: "Zara",
    brandDomain: "zara.com",
    url: "https://www.zara.com/us/en/woman-sale-l1059.html",
    selector: ".product-grid-product, li[class*='product']",
    textSelector: "h2, h3, [class*='price'], [class*='name']",
    waitFor: ".product-grid-product, li[class*='product']",
  },
] as const;

// ─── Scrape helpers ────────────────────────────────────────────────────────

// Opens a new tab in the shared browser, scrapes, closes the tab.
// Browser startup cost is paid once in main(), not per site.
async function fetchPage(
  browser: Browser,
  url: string,
  waitFor: string
): Promise<string | null> {
  const page = await browser.newPage();
  try {
    // Block images/fonts — we only need HTML text
    await page.route("**/*.{png,jpg,jpeg,gif,webp,woff,woff2,ttf,otf}", (r) => r.abort());

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    try {
      await page.waitForSelector(waitFor, { timeout: 15_000 });
    } catch {
      console.warn(`  ⚠ waitFor selector never appeared: "${waitFor}"`);
    }

    return await page.content();
  } catch (err) {
    console.warn(`  ⚠ Fetch failed for ${url}:`, err);
    return null;
  } finally {
    await page.close();
  }
}

function scrapeItems(
  html: string,
  itemSelector: string,
  textSelector: string,
  maxItems = 10
): string[] {
  const $ = cheerio.load(html);
  const texts: string[] = [];

  $(itemSelector)
    .slice(0, maxItems)
    .each((_, el) => {
      const parts: string[] = [];
      $(el)
        .find(textSelector)
        .each((_, child) => {
          const t = $(child).text().trim();
          if (t) parts.push(t);
        });
      const text = parts.length
        ? parts.join(" | ")
        : $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 10) texts.push(text.slice(0, 500));
    });

  return texts;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🛍  Starting web scraper pipeline...\n");

  let inserted = 0, skipped = 0, failed = 0;

  const browser = await chromium.launch({ headless: true });

  try {
    for (const target of TARGETS) {
      console.log(`Scraping ${target.brandName} (${target.url})`);

      const html = await fetchPage(browser, target.url, target.waitFor);
      if (!html) { failed++; continue; }

      const rawItems = scrapeItems(html, target.selector, target.textSelector);
      console.log(`  Found ${rawItems.length} items`);

      if (rawItems.length === 0) {
        console.warn(`  ⚠ No items matched selector "${target.selector}" — selector may need updating`);
        skipped++;
        continue;
      }

      for (const rawText of rawItems) {
        const item: ScrapedItem = {
          brandName: target.brandName,
          brandDomain: target.brandDomain,
          rawText,
        };

        const enriched = await enrichScrapedItem(item);
        if (!enriched) { failed++; continue; }

        const result = await insertPromotion(enriched);
        if (!result.inserted) {
          skipped++;
        } else {
          console.log(`  ✓ ${enriched.title}`);
          inserted++;
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(
    `\nDone. Inserted: ${inserted} | Skipped (dup/low): ${skipped} | Failed: ${failed}`
  );
}

main().catch(console.error);