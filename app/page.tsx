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

type FilterSource = "all" | "email" | "web";

// ─── Constants ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 60_000;
const READ_STORAGE_KEY = "promofeed_read";

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

// ─── Icons ─────────────────────────────────────────────────────────────────

function IconFeed({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function IconEmail({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function IconWeb({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconBookmark({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

function IconSettings({ active }: { active?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────

interface NavItem {
  id: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  filter?: FilterSource;
}

const NAV_ITEMS: NavItem[] = [
  { id: "all",       label: "All Deals",  icon: (a) => <IconFeed active={a} />,     filter: "all" },
  { id: "email",     label: "Emails",     icon: (a) => <IconEmail active={a} />,    filter: "email" },
  { id: "web",       label: "Web Deals",  icon: (a) => <IconWeb active={a} />,      filter: "web" },
  { id: "bookmarks", label: "Saved",      icon: (a) => <IconBookmark active={a} /> },
  { id: "settings",  label: "Settings",   icon: (a) => <IconSettings active={a} /> },
];

function Sidebar({ active, onSelect }: { active: string; onSelect: (item: NavItem) => void }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden sm:flex flex-col fixed top-0 left-0 h-full w-16 bg-white dark:bg-zinc-950 border-r border-zinc-100 dark:border-zinc-800/60 z-20 py-4 items-center gap-1">
        <div className="mb-4 w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-black text-sm tracking-tighter">P</span>
        </div>
        <div className="flex flex-col gap-1 w-full px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                title={item.label}
                className={`relative flex flex-col items-center justify-center w-full py-2.5 rounded-lg transition-all group ${
                  isActive
                    ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400"
                    : "text-zinc-400 dark:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-600 dark:bg-indigo-400 rounded-r" />
                )}
                {item.icon(isActive)}
                <span className="text-[9px] mt-0.5 font-medium tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/95 dark:bg-zinc-950/95 backdrop-blur border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-around px-2 py-1">
        {NAV_ITEMS.filter((i) => i.id !== "settings").map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-colors ${
                isActive ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {item.icon(isActive)}
              <span className="text-[9px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

function PromotionCard({ promo, isRead, onRead }: { promo: Promotion; isRead: boolean; onRead: (id: string) => void }) {
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
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, [isRead, promo.id, onRead]);

  const hasImage = !!promo.best_image_url && !imgError;

  return (
    <a
      ref={ref}
      href={promo.click_url ?? `https://${rootDomain(promo.brand_domain)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block border-b border-zinc-100 dark:border-zinc-800/60 px-5 py-4 transition-all hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 ${
        !isRead ? "border-l-2 border-l-indigo-400 dark:border-l-indigo-500" : ""
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center ring-1 ring-zinc-200 dark:ring-zinc-700">
          {!logoError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl(promo.brand_domain)} alt={promo.brand_name} className="w-9 h-9 object-cover" onError={() => setLogoError(true)} />
          ) : (
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">{promo.brand_name.charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{promo.brand_name}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{timeAgo(promo.created_at)}</span>
            {promo.source === "web" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-semibold tracking-wide">WEB</span>
            )}
          </div>
        </div>
        {!isRead && <div className="flex-shrink-0 w-2 h-2 rounded-full bg-indigo-500" />}
      </div>

      {/* Content */}
      <div className="pl-12">
        <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 leading-snug mb-1">{promo.title}</p>
        {promo.description && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-3 line-clamp-2">{promo.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {promo.discount_text && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-semibold">{promo.discount_text}</span>
          )}
          {promo.promo_code && (
            <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 tracking-widest border border-dashed border-zinc-300 dark:border-zinc-600 uppercase">{promo.promo_code}</span>
          )}
          {promo.expiry_date && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">until {new Date(promo.expiry_date).toLocaleDateString()}</span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500">{promo.category}</span>
        </div>
        {hasImage && (
          <div className="relative w-full rounded-xl overflow-hidden border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900" style={{ paddingTop: "52%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={promo.best_image_url!}
              alt={promo.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              onError={() => setImgError(true)}
            />
          </div>
        )}
      </div>
    </a>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterSource }) {
  const messages: Record<FilterSource, { title: string; sub: string }> = {
    all:   { title: "No promotions yet",  sub: "Run the pipeline to ingest emails and scrape deals." },
    email: { title: "No email deals yet", sub: "Run the email pipeline to start ingesting promotions." },
    web:   { title: "No web deals yet",   sub: "Run the scraper to pull deals from retail sites." },
  };
  const { title, sub } = messages[filter];
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
        <span className="text-2xl">🏷️</span>
      </div>
      <p className="text-zinc-700 dark:text-zinc-300 font-semibold mb-1">{title}</p>
      <p className="text-sm text-zinc-400 dark:text-zinc-500 max-w-xs">{sub}</p>
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
  const [activeNav, setActiveNav] = useState<string>("all");
  const [filter, setFilter] = useState<FilterSource>("all");

  // Use refs for pagination state to avoid stale closures in callbacks
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const newestIdRef = useRef<string | null>(null);
  // Keep filter in a ref so loadMore always reads the current value
  const filterRef = useRef<FilterSource>("all");

  // Sync filter ref whenever state changes
  useEffect(() => { filterRef.current = filter; }, [filter]);

  const fetchPage = useCallback(async (offset: number, sourceFilter: FilterSource): Promise<Promotion[]> => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    const res = await fetch(`/api/promotions?${params}`);
    const data = await res.json();
    return data.promotions ?? [];
  }, []);

  // Initial / filter-change load — resets all pagination state
  const loadFresh = useCallback(async (sourceFilter: FilterSource) => {
    setLoading(true);
    setPromotions([]);
    offsetRef.current = 0;
    newestIdRef.current = null;
    hasMoreRef.current = true;
    setHasMore(true);

    try {
      const incoming = await fetchPage(0, sourceFilter);
      setPromotions(incoming);
      offsetRef.current = incoming.length;
      hasMoreRef.current = incoming.length === PAGE_SIZE;
      setHasMore(incoming.length === PAGE_SIZE);
      if (incoming.length > 0) newestIdRef.current = incoming[0].id;
    } catch (err) {
      console.error("Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  // Append next page — reads current filter from ref to avoid stale closure
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const incoming = await fetchPage(offsetRef.current, filterRef.current);
      setPromotions((prev) => [...prev, ...incoming]);
      offsetRef.current += incoming.length;
      hasMoreRef.current = incoming.length === PAGE_SIZE;
      setHasMore(incoming.length === PAGE_SIZE);
    } catch (err) {
      console.error("loadMore failed:", err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage]);

  // Poll for new items at the top
  const pollForNew = useCallback(async () => {
    if (!newestIdRef.current) return;
    try {
      const incoming = await fetchPage(0, filterRef.current);
      const cutIdx = incoming.findIndex((x) => x.id === newestIdRef.current);
      const newItems = cutIdx > 0 ? incoming.slice(0, cutIdx) : [];
      if (newItems.length > 0) {
        setPromotions((prev) => [...newItems, ...prev]);
        newestIdRef.current = newItems[0].id;
        offsetRef.current += newItems.length;
      }
    } catch {
      // Polling failures are transient (server restart, network blip) — self-recover on next interval
    }
  }, [fetchPage]);

  // Initial load
  useEffect(() => {
    setRead(getRead());
    loadFresh("all");
  }, [loadFresh]);

  // Re-fetch when filter changes (skip initial mount — handled above)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    loadFresh(filter);
  }, [filter, loadFresh]);

  // Polling
  useEffect(() => {
    const id = setInterval(pollForNew, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollForNew]);

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

  const handleRead = useCallback((id: string) => {
    markRead(id);
    setRead((prev) => new Set(prev).add(id));
  }, []);

  const handleNavSelect = (item: NavItem) => {
    setActiveNav(item.id);
    if (item.filter) setFilter(item.filter);
  };

  const filterLabels: Record<FilterSource, string> = {
    all: "All Deals",
    email: "Email Deals",
    web: "Web Deals",
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar active={activeNav} onSelect={handleNavSelect} />

      <div className="sm:ml-16">
        {/* Sticky header */}
        <header className="sticky top-0 z-10 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border-b border-zinc-100 dark:border-zinc-800/60 px-5 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {filterLabels[filter]}
            </h1>
            {promotions.length > 0 && !loading && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                {promotions.filter((p) => !read.has(p.id)).length} unread
              </p>
            )}
          </div>
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center sm:hidden">
            <span className="text-white font-black text-xs">P</span>
          </div>
        </header>

        {/* Feed */}
        <main className="max-w-xl mx-auto">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : promotions.length === 0 ? (
            <EmptyState filter={filter} />
          ) : (
            <>
              {promotions.map((p) => (
                <PromotionCard key={p.id} promo={p} isRead={read.has(p.id)} onRead={handleRead} />
              ))}

              <div ref={sentinelRef} className="h-8" />

              {loadingMore && (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              )}

              {!hasMore && (
                <p className="text-center text-zinc-400 dark:text-zinc-600 py-6 text-xs">
                  You&apos;re all caught up ✓
                </p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
