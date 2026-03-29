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
}