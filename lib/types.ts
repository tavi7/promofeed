// lib/types.ts

export interface RawEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  htmlBody: string;
  textBody: string;
}

export interface ParsedPromotion {
  source_email_id: string;
  brand_name: string;
  brand_domain: string;
  title: string;
  description: string;
  discount_text: string | null;
  promo_code: string | null;
  category: string;
  expiry_date: string | null;
  relevance_score: number;
  raw_text: string;
  // "email" = Gmail pipeline  |  "web" = scraper pipeline
  source: "email" | "web";
}

// Raw image extracted from email HTML before any processing
export interface RawImage {
  originalUrl: string;
  role: "hero" | "logo" | "banner" | "product" | "other";
  width?: number;
  height?: number;
  altText?: string;
}

// Final image record ready for DB insert — mirrors promotion_images table
export interface PromotionImage {
  promotion_id: string;
  original_url: string;
  storage_path: string;
  public_url: string;
  role: RawImage["role"];
  width: number;
  height: number;
  mime_type: string;
  file_size_bytes: number;
  ai_description: string;
  ai_tags: string[];
  has_text: boolean;
  extracted_text: string | null;
  sort_order: number;
}