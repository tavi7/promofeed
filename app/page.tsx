"use client";

// app/page.tsx
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Promotion {
  id: string;
  brand_name: string;
  brand_domain: string;
  title: string;
  description: string;
  discount_text: string | null;
  promo_code: string | null;
  category: string;
  expiry_date: string | null;
  relevance_score: number;
  created_at: string;
  best_image_url: string | null;
  source: "email" | "web";
  click_url: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 60_000;
const READ_STORAGE_KEY = "promofeed_read";

// ─── Helpers ───────────────────────────────────────────────────────────────

// Known two-part ccTLD second levels — add more as needed
const CC_TLDS = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

// Strip subdomains while correctly handling ccTLDs:
// "mail.hm.com" → "hm.com"
// "newsletters.terminal-x.co.il" → "terminal-x.co.il"
// "email.nike.com" → "nike.com"
function rootDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;
  // Check if the second-to-last part is a known ccTLD second level (e.g. "co" in "co.il")
  const isCcTld = parts.length >= 3 && CC_TLDS.has(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return isCcTld ? parts.slice(-3).join(".") : parts.slice(-2).join(".");
}

function logoUrl(domain: string) {
  return `https://logo.clearbit.com/${rootDomain(domain)}`;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function getRead(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_STORAGE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function markRead(id: string) {
  try {
    const s = getRead();
    s.add(id);
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...s]));
  } catch {}
}

// ─── Card ──────────────────────────────────────────────────────────────────

function PromotionCard({
  promo,
  isRead,
  onRead,
}: {
  promo: Promotion;
  isRead: boolean;
  onRead: (id: string) => void;
}) {
  // useRef<HTMLElement> works for both div and a elements in IntersectionObserver
  const ref = useRef<HTMLAnchorElement>(null);
  const [logoError, setLogoError] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (isRead) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onRead(promo.id); },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isRead, promo.id, onRead]);

  return (
    <a
      ref={ref}
      href={promo.click_url ?? `https://${rootDomain(promo.brand_domain)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`block border-b border-zinc-100 dark:border-zinc-800 px-4 py-4 transition-colors ${
        isRead ? "opacity-60" : ""
      } hover:bg-zinc-50 dark:hover:bg-zinc-900/40`}
    >
      {/* Header: logo + brand + time + source badge */}
      <div className="flex items-center gap-3 mb-2">
        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
          {!logoError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl(promo.brand_domain)}
              alt={promo.brand_name}
              className="w-10 h-10 object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <span className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase">
              {promo.brand_name.charAt(0)}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
              {promo.brand_name}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0">
              {timeAgo(promo.created_at)}
            </span>
            {promo.source === "web" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium flex-shrink-0">
                web
              </span>
            )}
          </div>
        </div>

        <div
          className="flex-shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: `hsl(${(promo.relevance_score - 1) * 12}, 70%, 50%)` }}
          title={`Score: ${promo.relevance_score}/10`}
        />
      </div>

      {/* Body */}
      <div className="pl-[52px]">
        <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug mb-1">
          {promo.title}
        </p>
        {promo.description && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed mb-2">
            {promo.description}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-3">
          {promo.discount_text && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-medium">
              {promo.discount_text}
            </span>
          )}
          {promo.promo_code && (
            <span className="text-xs px-2 py-0.5 rounded font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 tracking-wider border border-dashed border-zinc-300 dark:border-zinc-600">
              {promo.promo_code}
            </span>
          )}
          {promo.expiry_date && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              until {new Date(promo.expiry_date).toLocaleDateString()}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            {promo.category}
          </span>
        </div>

        {/* Best image — Twitter-style, below text */}
        {promo.best_image_url && !imgError && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={promo.best_image_url}
            alt={promo.title}
            className="w-full max-h-80 object-contain rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
            onError={() => setImgError(true)}
          />
        )}
      </div>
    </a>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Home() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  // Track the newest promotion ID we've seen so polling only prepends new ones
  const newestIdRef = useRef<string | null>(null);

  const fetchPromotions = useCallback(async (offset: number, append = false) => {
    try {
      const res = await fetch(`/api/promotions?limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await res.json();
      const incoming: Promotion[] = data.promotions ?? [];

      setPromotions((prev) => (append ? [...prev, ...incoming] : incoming));
      setHasMore(incoming.length === PAGE_SIZE);
      offsetRef.current = offset + incoming.length;
      if (!append && incoming.length > 0) {
        newestIdRef.current = incoming[0].id;
      }
    } catch (err) {
      console.error("Fetch failed:", err);
    }
  }, []);

  // Poll for new items only — prepend without disturbing scroll position
  const pollForNew = useCallback(async () => {
    if (!newestIdRef.current) return;
    try {
      const res = await fetch(`/api/promotions?limit=${PAGE_SIZE}&offset=0`);
      const data = await res.json();
      const incoming: Promotion[] = data.promotions ?? [];
      const newItems = incoming.filter((p) => p.id !== newestIdRef.current &&
        // only items newer than our current newest
        incoming.indexOf(p) < incoming.findIndex((x) => x.id === newestIdRef.current)
      );
      if (newItems.length > 0) {
        setPromotions((prev) => [...newItems, ...prev]);
        newestIdRef.current = newItems[0].id;
        offsetRef.current += newItems.length;
      }
    } catch (err) {
      console.error("Poll failed:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    setRead(getRead());
    fetchPromotions(0).finally(() => setLoading(false));
  }, [fetchPromotions]);

  // Polling — only prepends genuinely new items
  useEffect(() => {
    const id = setInterval(pollForNew, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollForNew]);

  const handleRead = useCallback((id: string) => {
    markRead(id);
    setRead((prev) => new Set(prev).add(id));
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchPromotions(offsetRef.current, true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, fetchPromotions]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          PromoFeed
        </h1>
      </header>

      <main className="max-w-xl mx-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : promotions.length === 0 ? (
          <p className="text-center text-zinc-400 py-16 text-sm">No promotions yet.</p>
        ) : (
          <>
            {promotions.map((p) => (
              <PromotionCard
                key={p.id}
                promo={p}
                isRead={read.has(p.id)}
                onRead={handleRead}
              />
            ))}

            <div ref={sentinelRef} className="h-8" />

            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
              </div>
            )}

            {!hasMore && (
              <p className="text-center text-zinc-400 py-6 text-xs">
                You&apos;re all caught up
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
