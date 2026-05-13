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
  all_images: string[];
  best_image_url: string | null;
  source: "email" | "web";
  click_url: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 60_000;
const READ_STORAGE_KEY = "promofeed_read";
const EXCLUDE_COOKIE = "promofeed_exclude";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// ─── Helpers ───────────────────────────────────────────────────────────────

const CC_TLDS = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

function rootDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;
  const isCcTld =
    parts.length >= 3 &&
    CC_TLDS.has(parts[parts.length - 2]) &&
    parts[parts.length - 1].length === 2;
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

function getExcludedBrands(): string[] {
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${EXCLUDE_COOKIE}=([^;]*)`)
    );
    return match ? JSON.parse(decodeURIComponent(match[1])) : [];
  } catch {
    return [];
  }
}

function saveExcludedBrands(brands: string[]) {
  document.cookie = `${EXCLUDE_COOKIE}=${encodeURIComponent(
    JSON.stringify(brands)
  )}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

// ─── Image Carousel ────────────────────────────────────────────────────────

function ImageCarousel({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const isDragging = useRef(false);

  const count = images.length;

  const goTo = (i: number) => setIndex(Math.max(0, Math.min(count - 1, i)));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    isDragging.current = false;
    setOffset(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    isDragging.current = Math.abs(dx) > 5;
    setOffset(dx);
  };

  const onTouchEnd = () => {
    if (touchStartX.current === null) return;
    if (offset < -50 && index < count - 1) goTo(index + 1);
    else if (offset > 50 && index > 0) goTo(index - 1);
    setOffset(0);
    touchStartX.current = null;
  };

  const translateX = -index * 100 + (offset / (typeof window !== "undefined" ? window.innerWidth : 390)) * 100;

  if (count === 0) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-zinc-900" style={{ aspectRatio: "4/5" }}>
      {/* Slides */}
      <div
        className="flex h-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${translateX}%)`, willChange: "transform" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {images.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt={i === 0 ? title : `${title} image ${i + 1}`}
            className="flex-shrink-0 w-full h-full object-cover"
            draggable={false}
          />
        ))}
      </div>

      {/* Left/right arrows — desktop only */}
      {count > 1 && (
        <>
          {index > 0 && (
            <button
              onClick={(e) => { e.preventDefault(); goTo(index - 1); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Previous image"
            >
              ‹
            </button>
          )}
          {index < count - 1 && (
            <button
              onClick={(e) => { e.preventDefault(); goTo(index + 1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Next image"
            >
              ›
            </button>
          )}
        </>
      )}

      {/* Dots */}
      {count > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.preventDefault(); goTo(i); }}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === index ? "bg-white" : "bg-white/40"
              }`}
              aria-label={`Go to image ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
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
  const ref = useRef<HTMLElement>(null);
  const [logoError, setLogoError] = useState(false);

  // Mark as read after 2s of being 80%+ visible
  useEffect(() => {
    if (isRead) return;
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer = setTimeout(() => onRead(promo.id), 2000);
        } else {
          clearTimeout(timer);
        }
      },
      { threshold: 0.8 }
    );
    observer.observe(el);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [isRead, promo.id, onRead]);

  const images = promo.all_images?.length
    ? promo.all_images
    : promo.best_image_url
    ? [promo.best_image_url]
    : [];

  const hasImage = images.length > 0;

  return (
    <article
      ref={ref}
      className={`relative group mb-3 mx-3 rounded-2xl overflow-hidden bg-zinc-900 transition-opacity ${
        isRead ? "opacity-60" : "opacity-100"
      }`}
    >
      <a
        href={promo.click_url ?? `https://${rootDomain(promo.brand_domain)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {hasImage ? (
          <>
            {/* Image carousel — full width, 4:5 portrait */}
            <ImageCarousel images={images} title={promo.title} />

            {/* Gradient overlay at bottom of image */}
            <div className="absolute bottom-0 left-0 right-0 px-3 pt-16 pb-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none">
              {/* Brand row */}
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  {!logoError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl(promo.brand_domain)}
                      alt={promo.brand_name}
                      className="w-6 h-6 object-contain"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-zinc-300 uppercase">
                      {promo.brand_name.charAt(0)}
                    </span>
                  )}
                </div>
                <span className="text-xs font-semibold text-white/90 truncate">
                  {promo.brand_name}
                </span>
                <span className="text-[10px] text-white/50 flex-shrink-0">
                  {timeAgo(promo.created_at)}
                </span>
                {/* Unread dot */}
                {!isRead && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                )}
              </div>

              {/* Title */}
              <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
                {promo.title}
              </p>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mt-1.5 pointer-events-none">
                {promo.discount_text && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/90 text-white font-medium">
                    {promo.discount_text}
                  </span>
                )}
                {promo.promo_code && (
                  <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-white/20 text-white tracking-wider border border-white/30">
                    {promo.promo_code}
                  </span>
                )}
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                  {promo.category}
                </span>
              </div>
            </div>
          </>
        ) : (
          /* Text-only card — no image available */
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center flex-shrink-0">
                {!logoError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl(promo.brand_domain)}
                    alt={promo.brand_name}
                    className="w-8 h-8 object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <span className="text-xs font-bold text-zinc-300 uppercase">
                    {promo.brand_name.charAt(0)}
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold text-zinc-100 truncate">
                {promo.brand_name}
              </span>
              <span className="text-xs text-zinc-500 flex-shrink-0">
                {timeAgo(promo.created_at)}
              </span>
              {!isRead && (
                <span className="ml-auto w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
              )}
            </div>
            <p className="text-sm font-semibold text-zinc-100 leading-snug mb-2">
              {promo.title}
            </p>
            {promo.description && (
              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3 mb-2">
                {promo.description}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {promo.discount_text && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium border border-emerald-500/30">
                  {promo.discount_text}
                </span>
              )}
              {promo.promo_code && (
                <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-zinc-800 text-zinc-300 tracking-wider border border-dashed border-zinc-600">
                  {promo.promo_code}
                </span>
              )}
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
                {promo.category}
              </span>
            </div>
          </div>
        )}
      </a>
    </article>
  );
}

// ─── Brand Filter Drawer ───────────────────────────────────────────────────

function BrandDrawer({
  open,
  onClose,
  promotions,
  excludedBrands,
  onToggleBrand,
  onAddBrand,
}: {
  open: boolean;
  onClose: () => void;
  promotions: Promotion[];
  excludedBrands: string[];
  onToggleBrand: (brand: string) => void;
  onAddBrand: () => void;
}) {
  // Unique brands from current feed
  const brands = Array.from(new Set(promotions.map((p) => p.brand_name))).sort();

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">Filter Brands</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {brands.map((brand) => {
            const excluded = excludedBrands.includes(brand);
            return (
              <button
                key={brand}
                onClick={() => onToggleBrand(brand)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  excluded
                    ? "bg-zinc-800/50 text-zinc-500 line-through"
                    : "bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                <span className="truncate">{brand}</span>
                <span className={`ml-2 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                  excluded
                    ? "border-zinc-600 bg-zinc-700 text-zinc-400"
                    : "border-zinc-600"
                }`}>
                  {excluded ? "✕" : ""}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-4 border-t border-zinc-800">
          <button
            onClick={onAddBrand}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            + Add a Brand
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Add Brand Modal ───────────────────────────────────────────────────────

function AddBrandModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "exists">("idle");

  const submit = async () => {
    if (!name.trim()) return;
    setStatus("loading");
    try {
      const checkRes = await fetch(`/api/brands?name=${encodeURIComponent(name.trim())}`);
      const checkData = await checkRes.json();
      if (checkData.exists) {
        setStatus("exists");
        return;
      }
      await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setStatus("done");
    } catch {
      setStatus("idle");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-60 flex items-end sm:items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-5">
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Request a Brand</h3>
        <p className="text-xs text-zinc-500 mb-4">
          We&apos;ll add it to the feed when possible.
        </p>

        {status === "done" ? (
          <>
            <p className="text-sm text-emerald-400 mb-4">Request sent! ✓</p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-sm"
            >
              Close
            </button>
          </>
        ) : status === "exists" ? (
          <>
            <p className="text-sm text-zinc-300 mb-4">
              <strong>{name}</strong> is already tracked.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-sm"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Brand name (e.g. Zara)"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={status === "loading" || !name.trim()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {status === "loading" ? "Sending…" : "Request"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Home() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addBrandOpen, setAddBrandOpen] = useState(false);
  const [excludedBrands, setExcludedBrands] = useState<string[]>([]);

  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const newestIdRef = useRef<string | null>(null);

  // Build URL with exclude param
  const buildUrl = useCallback(
    (offset: number, excluded: string[]) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (excluded.length > 0) {
        params.set("exclude", excluded.join(","));
      }
      return `/api/promotions?${params.toString()}`;
    },
    []
  );

  const fetchPromotions = useCallback(
    async (offset: number, append: boolean, excluded: string[]) => {
      try {
        const res = await fetch(buildUrl(offset, excluded));
        const data = await res.json();
        const incoming: Promotion[] = data.promotions ?? [];
        setPromotions((prev) => (append ? [...prev, ...incoming] : incoming));
        hasMoreRef.current = incoming.length === PAGE_SIZE;
        setHasMore(incoming.length === PAGE_SIZE);
        offsetRef.current = offset + incoming.length;
        if (!append && incoming.length > 0) {
          newestIdRef.current = incoming[0].id;
        }
      } catch (err) {
        console.error("Fetch failed:", err);
      }
    },
    [buildUrl]
  );

  // Poll for new items at the top
  const pollForNew = useCallback(async () => {
    if (!newestIdRef.current) return;
    try {
      const res = await fetch(buildUrl(0, excludedBrands));
      const data = await res.json();
      const incoming: Promotion[] = data.promotions ?? [];
      const cutoff = incoming.findIndex((x) => x.id === newestIdRef.current);
      const newItems = cutoff > 0 ? incoming.slice(0, cutoff) : [];
      if (newItems.length > 0) {
        setPromotions((prev) => [...newItems, ...prev]);
        newestIdRef.current = newItems[0].id;
        offsetRef.current += newItems.length;
      }
    } catch (err) {
      console.error("Poll failed:", err);
    }
  }, [buildUrl, excludedBrands]);

  // Initial load — read excluded brands from cookie first
  useEffect(() => {
    const excluded = getExcludedBrands();
    setExcludedBrands(excluded);
    setRead(getRead());
    fetchPromotions(0, false, excluded).finally(() => setLoading(false));
  }, [fetchPromotions]);

  // Polling
  useEffect(() => {
    const id = setInterval(pollForNew, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollForNew]);

  const handleRead = useCallback((id: string) => {
    markRead(id);
    setRead((prev) => new Set(prev).add(id));
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    await fetchPromotions(offsetRef.current, true, excludedBrands);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [fetchPromotions, excludedBrands]);

  // Infinite scroll — callback ref pattern (attaches after sentinel mounts)
  const sentinelCallback = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) loadMore(); },
        { threshold: 0 }
      );
      observer.observe(el);
    },
    [loadMore]
  );

  // Toggle brand exclusion and reload
  const handleToggleBrand = useCallback(
    (brand: string) => {
      const updated = excludedBrands.includes(brand)
        ? excludedBrands.filter((b) => b !== brand)
        : [...excludedBrands, brand];
      setExcludedBrands(updated);
      saveExcludedBrands(updated);
      offsetRef.current = 0;
      setLoading(true);
      fetchPromotions(0, false, updated).finally(() => setLoading(false));
    },
    [excludedBrands, fetchPromotions]
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Sticky dark nav */}
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur border-b border-zinc-800/60 px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-bold text-zinc-100 tracking-tight">
          PromoFeed
        </h1>
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex flex-col gap-1 p-1"
          aria-label="Open menu"
        >
          <span className="block w-5 h-px bg-zinc-400" />
          <span className="block w-5 h-px bg-zinc-400" />
          <span className="block w-5 h-px bg-zinc-400" />
        </button>
      </header>

      <main className="max-w-lg mx-auto pt-3 pb-16">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          </div>
        ) : promotions.length === 0 ? (
          <p className="text-center text-zinc-500 py-20 text-sm">No promotions yet.</p>
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

            <div ref={sentinelCallback} className="h-8" />

            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
              </div>
            )}

            {!hasMore && (
              <p className="text-center text-zinc-600 py-6 text-xs">
                You&apos;re all caught up
              </p>
            )}
          </>
        )}
      </main>

      <BrandDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        promotions={promotions}
        excludedBrands={excludedBrands}
        onToggleBrand={handleToggleBrand}
        onAddBrand={() => { setDrawerOpen(false); setAddBrandOpen(true); }}
      />

      {addBrandOpen && (
        <AddBrandModal onClose={() => setAddBrandOpen(false)} />
      )}
    </div>
  );
}
