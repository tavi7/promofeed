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

const NAV_ITEMS = [
  {
    key: "all",
    label: "All",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M2 4a1 1 0 011-1h14a1 1 0 010 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h14a1 1 0 010 2H3a1 1 0 01-1-1zm0 5a1 1 0 011-1h14a1 1 0 010 2H3a1 1 0 01-1-1z" />
      </svg>
    ),
  },
  {
    key: "email",
    label: "Email",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
      </svg>
    ),
  },
  {
    key: "web",
    label: "Web",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path
          fillRule="evenodd"
          d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16A8 8 0 0010 2zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
];

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

// ─── Sidebar ───────────────────────────────────────────────────────────────

function Sidebar({
  activeFilter,
  onFilter,
  unreadCount,
}: {
  activeFilter: string;
  onFilter: (f: string) => void;
  unreadCount: number;
}) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden sm:flex flex-col fixed left-0 top-0 h-full w-56 border-r border-zinc-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 z-20 py-6 px-3">
        {/* Logo mark + wordmark */}
        <div className="px-3 mb-8">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-white flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                <rect x="2" y="2" width="5" height="5" rx="1" fill="white" className="dark:fill-zinc-900" />
                <rect x="9" y="2" width="5" height="5" rx="1" fill="white" className="dark:fill-zinc-900" />
                <rect x="2" y="9" width="5" height="5" rx="1" fill="white" className="dark:fill-zinc-900" />
                <circle cx="11.5" cy="11.5" r="2.5" fill="white" className="dark:fill-zinc-900" />
              </svg>
            </div>
            <span className="font-bold text-[15px] tracking-tight text-zinc-900 dark:text-zinc-100">
              PromoFeed
            </span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-0.5 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = activeFilter === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onFilter(item.key)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left group
                  ${
                    active
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
                      : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
              >
                <span className={`transition-opacity ${active ? "opacity-100" : "opacity-50 group-hover:opacity-80"}`}>
                  {item.icon}
                </span>
                {item.label}
                {item.key === "all" && unreadCount > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                    active ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900" : "bg-blue-500 text-white"
                  }`}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer hint */}
        <div className="px-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Live · updates every min</p>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-zinc-100 dark:border-zinc-800 flex safe-area-inset-bottom">
        {NAV_ITEMS.map((item) => {
          const active = activeFilter === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onFilter(item.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors relative
                ${active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"}`}
            >
              <span className={`transition-all ${active ? "scale-110" : ""}`}>
                {item.icon}
              </span>
              {item.label}
              {item.key === "all" && unreadCount > 0 && !active && (
                <span className="absolute top-2 right-[calc(50%-14px)] w-2 h-2 rounded-full bg-blue-500 border-2 border-white dark:border-zinc-950" />
              )}
            </button>
          );
        })}
      </nav>
    </>
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
  const [imgError, setImgError] = useState(false);

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
  const [activeFilter, setActiveFilter] = useState("all");

  const offsetRef = useRef(0);
  const newestIdRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const activeFilterRef = useRef("all");

  const fetchPromotions = useCallback(
    async (offset: number, append = false, filter = activeFilterRef.current) => {
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (filter !== "all") params.set("source", filter);

        const res = await fetch(`/api/promotions?${params}`);
        const data = await res.json();
        const incoming: Promotion[] = data.promotions ?? [];

        setPromotions((prev) => (append ? [...prev, ...incoming] : incoming));

        const more = incoming.length === PAGE_SIZE;
        setHasMore(more);
        hasMoreRef.current = more;

        offsetRef.current = offset + incoming.length;
        if (!append && incoming.length > 0) {
          newestIdRef.current = incoming[0].id;
        }
      } catch (err) {
        console.error("Fetch failed:", err);
      }
    },
    []
  );

  const pollForNew = useCallback(async () => {
    if (!newestIdRef.current) return;
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: "0" });
      if (activeFilterRef.current !== "all")
        params.set("source", activeFilterRef.current);

      const res = await fetch(`/api/promotions?${params}`);
      const data = await res.json();
      const incoming: Promotion[] = data.promotions ?? [];
      const newItems = incoming.filter(
        (p) =>
          p.id !== newestIdRef.current &&
          incoming.indexOf(p) <
            incoming.findIndex((x) => x.id === newestIdRef.current)
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

  const handleFilter = useCallback(
    (f: string) => {
      activeFilterRef.current = f;
      setActiveFilter(f);
      offsetRef.current = 0;
      hasMoreRef.current = true;
      setHasMore(true);
      setLoading(true);
      fetchPromotions(0, false, f).finally(() => setLoading(false));
    },
    [fetchPromotions]
  );

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    await fetchPromotions(offsetRef.current, true);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [fetchPromotions]);

  // Initial load
  useEffect(() => {
    setRead(getRead());
    fetchPromotions(0).finally(() => setLoading(false));
  }, [fetchPromotions]);

  // Polling
  useEffect(() => {
    const id = setInterval(pollForNew, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollForNew]);

  // ── Infinite scroll via window scroll ─────────────────────────────────
  // window scroll listener is immune to the IntersectionObserver teardown
  // race that was silently swallowing loadMore calls.
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      if (total - scrolled < 400) {
        loadMore();
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMore]);

  const handleRead = useCallback((id: string) => {
    markRead(id);
    setRead((prev) => new Set(prev).add(id));
  }, []);

  const unreadCount = promotions.filter((p) => !read.has(p.id)).length;

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Sidebar
        activeFilter={activeFilter}
        onFilter={handleFilter}
        unreadCount={unreadCount}
      />

      <div className="sm:ml-56">
        <header className="sticky top-0 z-10 bg-white/90 dark:bg-black/90 backdrop-blur border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 flex items-center justify-between">
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {activeFilter === "all"
              ? "All Promos"
              : activeFilter === "email"
              ? "From Email"
              : "From Web"}
          </h1>
          {unreadCount > 0 && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {unreadCount} unread
            </span>
          )}
        </header>

        <main className="max-w-xl mx-auto pb-20 sm:pb-8">
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

              {loadingMore && (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                </div>
              )}

              {!hasMore && !loadingMore && (
                <p className="text-center text-zinc-400 py-6 text-xs">
                  You&apos;re all caught up
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
