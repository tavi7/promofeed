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
  all_images: string[] | null;
  source: "email" | "web";
  click_url: string | null;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 60_000;
const READ_STORAGE_KEY = "promofeed_read";
const EXCLUDED_BRANDS_COOKIE = "pf_excluded_brands";

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
      new RegExp(`(?:^|; )${EXCLUDED_BRANDS_COOKIE}=([^;]*)`)
    );
    return match ? JSON.parse(decodeURIComponent(match[1])) : [];
  } catch {
    return [];
  }
}

function saveExcludedBrands(brands: string[]) {
  const encoded = encodeURIComponent(JSON.stringify(brands));
  const maxAge = 365 * 24 * 60 * 60;
  document.cookie = `${EXCLUDED_BRANDS_COOKIE}=${encoded}; max-age=${maxAge}; path=/; SameSite=Lax`;
}

function excludeParam(brands: string[]) {
  return brands.length ? `&exclude=${encodeURIComponent(brands.join(","))}` : "";
}

// ─── ImageCarousel ─────────────────────────────────────────────────────────

function ImageCarousel({ images, title }: { images: string[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={images[0]}
        alt={title}
        className="w-full max-h-80 object-contain rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
      />
    );
  }

  const prev = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveIndex((i) => (i - 1 + images.length) % images.length);
  };

  const next = (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveIndex((i) => (i + 1) % images.length);
  };

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 group"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
        touchDeltaX.current = 0;
      }}
      onTouchMove={(e) => {
        if (touchStartX.current !== null) {
          touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
        }
      }}
      onTouchEnd={() => {
        if (Math.abs(touchDeltaX.current) > 40) {
          if (touchDeltaX.current < 0) {
            setActiveIndex((i) => (i + 1) % images.length);
          } else {
            setActiveIndex((i) => (i - 1 + images.length) % images.length);
          }
        }
        touchStartX.current = null;
        touchDeltaX.current = 0;
      }}
    >
      {/* Slides */}
      <div
        className="flex transition-transform duration-300 ease-in-out"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {images.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt={`${title} ${i + 1}`}
            className="w-full flex-shrink-0 max-h-80 object-contain"
          />
        ))}
      </div>

      {/* Arrows — desktop only */}
      <button
        onClick={prev}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none"
        aria-label="Previous image"
      >
        ‹
      </button>
      <button
        onClick={next}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none"
        aria-label="Next image"
      >
        ›
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
        {images.map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === activeIndex ? "bg-white" : "bg-white/40"
            }`}
          />
        ))}
      </div>
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
  const ref = useRef<HTMLAnchorElement>(null);
  const [logoError, setLogoError] = useState(false);

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
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [isRead, promo.id, onRead]);

  // Prefer all_images array; fall back to best_image_url for older rows
  const images = promo.all_images?.length
    ? promo.all_images
    : promo.best_image_url
    ? [promo.best_image_url]
    : [];

  return (
    <a
      ref={ref}
      href={promo.click_url ?? `https://${rootDomain(promo.brand_domain)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`block border-b border-zinc-100 dark:border-zinc-800 px-4 py-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40 border-l-2 ${
        isRead
          ? "border-l-transparent"
          : "border-l-blue-400 dark:border-l-blue-500"
      }`}
    >
      {/* Header */}
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
          style={{
            backgroundColor: `hsl(${(promo.relevance_score - 1) * 12}, 70%, 50%)`,
          }}
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

        {images.length > 0 && (
          <ImageCarousel images={images} title={promo.title} />
        )}
      </div>
    </a>
  );
}

// ─── AddBrandModal ─────────────────────────────────────────────────────────

function AddBrandModal({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<
    "idle" | "checking" | "exists" | "sent" | "error"
  >("idle");

  const handleSubmit = async () => {
    const name = input.trim();
    if (!name) return;
    setStatus("checking");
    try {
      const checkRes = await fetch(
        `/api/brands?name=${encodeURIComponent(name)}`,
        { cache: "no-store" }
      );
      const checkData = await checkRes.json();
      if (checkData.exists) {
        setStatus("exists");
        return;
      }
      const postRes = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setStatus(postRes.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1">
          Add a brand
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          We&apos;ll start tracking their promos if they&apos;re not already in the feed.
        </p>

        {status === "sent" ? (
          <div className="text-center py-4">
            <p className="text-emerald-600 dark:text-emerald-400 font-medium text-sm">
              ✓ Request sent!
            </p>
            <p className="text-zinc-400 text-xs mt-1">We&apos;ll add them soon.</p>
            <button
              onClick={onClose}
              className="mt-4 text-xs text-zinc-500 underline"
            >
              Close
            </button>
          </div>
        ) : status === "exists" ? (
          <div className="text-center py-4">
            <p className="text-zinc-600 dark:text-zinc-400 text-sm">
              Already tracking <strong>{input}</strong>.
            </p>
            <button
              onClick={onClose}
              className="mt-4 text-xs text-zinc-500 underline"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              placeholder="e.g. Nike, Zara, ASOS"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              autoFocus
            />
            {status === "error" && (
              <p className="text-xs text-red-500 mb-2">
                Something went wrong. Try again.
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={status === "checking" || !input.trim()}
                className="flex-1 px-3 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {status === "checking" ? "Checking…" : "Request"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar({
  open,
  onClose,
  excludedBrands,
  allBrands,
  onToggleBrand,
  onAddBrand,
}: {
  open: boolean;
  onClose: () => void;
  excludedBrands: string[];
  allBrands: string[];
  onToggleBrand: (brand: string) => void;
  onAddBrand: () => void;
}) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-full w-72 z-40 bg-white dark:bg-zinc-900 shadow-xl transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
            Settings
          </span>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-4 overflow-y-auto h-[calc(100%-57px)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 mb-3">
            Hide brands
          </p>

          {allBrands.length === 0 ? (
            <p className="text-xs text-zinc-400">No brands yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {allBrands.map((brand) => {
                const hidden = excludedBrands.includes(brand);
                return (
                  <button
                    key={brand}
                    onClick={() => onToggleBrand(brand)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      hidden
                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 line-through"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    <span>{brand}</span>
                    {hidden && (
                      <span className="text-xs text-zinc-400 no-underline" style={{ textDecoration: "none" }}>
                        hidden
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={onAddBrand}
            className="mt-6 w-full px-3 py-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 text-sm text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
          >
            + Add a brand
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Home() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [excludedBrands, setExcludedBrandsState] = useState<string[]>([]);
  const [allBrands, setAllBrands] = useState<string[]>([]);

  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  // Use created_at timestamp for new-item detection — never stale unlike ID-based index comparison
  const newestCreatedAtRef = useRef<string | null>(null);

  const fetchPromotions = useCallback(
    async (offset: number, append = false, excluded: string[] = []) => {
      try {
        const res = await fetch(
          `/api/promotions?limit=${PAGE_SIZE}&offset=${offset}${excludeParam(excluded)}`,
          { cache: "no-store" } // always bypass Next.js + browser cache
        );
        const data = await res.json();
        const incoming: Promotion[] = data.promotions ?? [];

        setPromotions((prev) => (append ? [...prev, ...incoming] : incoming));
        hasMoreRef.current = incoming.length === PAGE_SIZE;
        setHasMore(incoming.length === PAGE_SIZE);
        offsetRef.current = offset + incoming.length;

        if (!append && incoming.length > 0) {
          newestCreatedAtRef.current = incoming[0].created_at;
          // Build brand list from this page
          const brands = [...new Set(incoming.map((p) => p.brand_name))].sort();
          setAllBrands(brands);
        }
      } catch (err) {
        console.error("Fetch failed:", err);
      }
    },
    []
  );

  // Poll: compare by created_at, not array index — works regardless of sort order
  const pollForNew = useCallback(async () => {
    if (!newestCreatedAtRef.current) return;
    const excluded = getExcludedBrands();
    try {
      const res = await fetch(
        `/api/promotions?limit=${PAGE_SIZE}&offset=0${excludeParam(excluded)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const incoming: Promotion[] = data.promotions ?? [];
      const newestAt = newestCreatedAtRef.current;

      const newItems = incoming.filter(
        (p) => new Date(p.created_at) > new Date(newestAt)
      );

      if (newItems.length > 0) {
        setPromotions((prev) => {
          // Dedupe by id in case of any overlap
          const existingIds = new Set(prev.map((p) => p.id));
          const fresh = newItems.filter((p) => !existingIds.has(p.id));
          return [...fresh, ...prev];
        });
        newestCreatedAtRef.current = newItems[0].created_at;
        offsetRef.current += newItems.length;
        // Merge any new brands into the sidebar list
        setAllBrands((prev) => {
          const combined = new Set([...prev, ...newItems.map((p) => p.brand_name)]);
          return [...combined].sort();
        });
      }
    } catch (err) {
      console.error("Poll failed:", err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    const excluded = getExcludedBrands();
    setExcludedBrandsState(excluded);
    setRead(getRead());
    fetchPromotions(0, false, excluded).finally(() => setLoading(false));
  }, [fetchPromotions]);

  // Polling interval
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
    await fetchPromotions(offsetRef.current, true, getExcludedBrands());
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [fetchPromotions]);

  const handleToggleBrand = useCallback(
    (brand: string) => {
      setExcludedBrandsState((prev) => {
        const next = prev.includes(brand)
          ? prev.filter((b) => b !== brand)
          : [...prev, brand];
        saveExcludedBrands(next);
        // Re-fetch from scratch with updated exclusions
        offsetRef.current = 0;
        newestCreatedAtRef.current = null;
        fetchPromotions(0, false, next);
        return next;
      });
    },
    [fetchPromotions]
  );

  // Callback ref — attaches observer only when the sentinel node actually mounts
  const sentinelCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) loadMore();
        },
        { threshold: 0 }
      );
      observer.observe(node);
    },
    [loadMore]
  );

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          PromoFeed
        </h1>
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-8 h-8 flex flex-col justify-center items-center gap-1.5"
          aria-label="Open menu"
        >
          <span className="w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 rounded" />
          <span className="w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 rounded" />
          <span className="w-5 h-0.5 bg-zinc-600 dark:bg-zinc-400 rounded" />
        </button>
      </header>

      <main className="max-w-xl mx-auto">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
          </div>
        ) : promotions.length === 0 ? (
          <p className="text-center text-zinc-400 py-16 text-sm">
            No promotions yet.
          </p>
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

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        excludedBrands={excludedBrands}
        allBrands={allBrands}
        onToggleBrand={handleToggleBrand}
        onAddBrand={() => {
          setSidebarOpen(false);
          setShowAddBrand(true);
        }}
      />

      {showAddBrand && (
        <AddBrandModal onClose={() => setShowAddBrand(false)} />
      )}
    </div>
  );
}
