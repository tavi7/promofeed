"use client";

// app/page.tsx
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface Brand {
  name: string;
  domain: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 60_000;
const READ_STORAGE_KEY = "promofeed_read";
const HIDDEN_BRANDS_COOKIE = "promofeed_hidden_brands";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Read state (localStorage) ────────────────────────────────────────────────

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

// ─── Brand-filter persistence (cookie, 1-year expiry) ─────────────────────────

function getHiddenBrands(): Set<string> {
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${HIDDEN_BRANDS_COOKIE}=([^;]*)`)
    );
    if (!match) return new Set();
    return new Set(JSON.parse(decodeURIComponent(match[1])));
  } catch {
    return new Set();
  }
}

function saveHiddenBrands(hidden: Set<string>) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${HIDDEN_BRANDS_COOKIE}=${encodeURIComponent(
    JSON.stringify([...hidden])
  )}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

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

  const hasImage = !!(promo.best_image_url && !imgError);

  function CardHeader({ overlay }: { overlay: boolean }) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center ring-1 ring-white/20">
          {!logoError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl(promo.brand_domain)}
              alt={promo.brand_name}
              className="w-8 h-8 object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <span className="text-xs font-bold text-white uppercase">
              {promo.brand_name.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span
            className={`font-semibold text-sm ${
              overlay ? "text-white drop-shadow" : "text-zinc-100"
            }`}
          >
            {promo.brand_name}
          </span>
          <span
            className={`text-xs ml-2 ${overlay ? "text-white/55" : "text-zinc-500"}`}
          >
            {timeAgo(promo.created_at)}
          </span>
        </div>
        {promo.source === "web" && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-300 font-medium border border-blue-400/30">
            web
          </span>
        )}
        {!isRead && (
          <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
        )}
      </div>
    );
  }

  function CardBody({ overlay }: { overlay: boolean }) {
    return (
      <>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {promo.discount_text && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
              {promo.discount_text}
            </span>
          )}
          {promo.promo_code && (
            <span className="text-xs px-2 py-0.5 rounded font-mono bg-white/10 text-white/80 tracking-wider border border-white/20">
              {promo.promo_code}
            </span>
          )}
          {promo.expiry_date && (
            <span className={`text-xs ${overlay ? "text-white/50" : "text-zinc-500"}`}>
              until {new Date(promo.expiry_date).toLocaleDateString()}
            </span>
          )}
        </div>
        <p
          className={`font-bold text-[17px] leading-snug mb-1 ${
            overlay ? "text-white drop-shadow" : "text-zinc-100"
          }`}
        >
          {promo.title}
        </p>
        {promo.description && (
          <p
            className={`text-sm leading-relaxed line-clamp-2 ${
              overlay ? "text-white/65" : "text-zinc-400"
            }`}
          >
            {promo.description}
          </p>
        )}
        <span
          className={`inline-block mt-2 text-[11px] uppercase tracking-wider ${
            overlay ? "text-white/35" : "text-zinc-600"
          }`}
        >
          {promo.category}
        </span>
      </>
    );
  }

  return (
    <a
      ref={ref}
      href={promo.click_url ?? `https://${rootDomain(promo.brand_domain)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-2xl overflow-hidden group select-none transition-transform duration-200 active:scale-[0.99]"
    >
      {hasImage ? (
        <div className="relative" style={{ aspectRatio: "4/5" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={promo.best_image_url!}
            alt={promo.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
            onError={() => setImgError(true)}
          />
          <div
            className="absolute inset-x-0 top-0 z-10 px-4 pt-4 pb-12"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.70) 0%, transparent 100%)",
            }}
          >
            <CardHeader overlay />
          </div>
          <div
            className="absolute inset-x-0 bottom-0 z-10 px-4 pb-5 pt-20"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)",
            }}
          >
            <CardBody overlay />
          </div>
        </div>
      ) : (
        <div className="bg-zinc-900 p-4 flex flex-col gap-3">
          <CardHeader overlay={false} />
          <CardBody overlay={false} />
        </div>
      )}
    </a>
  );
}

// ─── Side Menu ────────────────────────────────────────────────────────────────

function SideMenu({
  open,
  onClose,
  brands,
  hiddenBrands,
  onToggleBrand,
}: {
  open: boolean;
  onClose: () => void;
  brands: Brand[];
  hiddenBrands: Set<string>;
  onToggleBrand: (domain: string) => void;
}) {
  const [brandInput, setBrandInput] = useState("");
  const [brandStatus, setBrandStatus] = useState<{
    type: "exists" | "new" | "error" | null;
    message: string;
  }>({ type: null, message: "" });
  const [checking, setChecking] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleAddBrand() {
    const name = brandInput.trim();
    if (!name) return;
    setChecking(true);
    setBrandStatus({ type: null, message: "" });
    try {
      const res = await fetch(
        `/api/brands?name=${encodeURIComponent(name)}`
      );
      const data = await res.json();
      if (data.exists) {
        setBrandStatus({
          type: "exists",
          message: `${name} is already in PromoFeed!`,
        });
      } else {
        setBrandStatus({
          type: "new",
          message: `We will add ${name} very soon to PromoFeed.`,
        });
      }
    } catch {
      setBrandStatus({ type: "error", message: "Something went wrong. Try again." });
    } finally {
      setChecking(false);
    }
  }

  const visibleCount = brands.filter(
    (b) => !hiddenBrands.has(rootDomain(b.domain))
  ).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 z-40 h-full w-80 max-w-[90vw] bg-zinc-950 border-l border-white/[0.07] flex flex-col transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <span className="font-bold text-white text-base">Manage Feed</span>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors p-1"
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Add a Brand ── */}
          <div className="px-5 py-4 border-b border-white/[0.07]">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              Add a Brand
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={brandInput}
                onChange={(e) => {
                  setBrandInput(e.target.value);
                  setBrandStatus({ type: null, message: "" });
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddBrand(); }}
                placeholder="e.g. Zara, ASOS…"
                className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button
                onClick={handleAddBrand}
                disabled={checking || !brandInput.trim()}
                className="px-3 py-2 rounded-lg bg-white text-zinc-950 text-sm font-semibold disabled:opacity-40 transition-opacity hover:bg-zinc-200"
              >
                {checking ? "…" : "Add"}
              </button>
            </div>
            {brandStatus.type && (
              <p
                className={`mt-2 text-xs leading-snug ${
                  brandStatus.type === "exists"
                    ? "text-emerald-400"
                    : brandStatus.type === "new"
                    ? "text-blue-400"
                    : "text-red-400"
                }`}
              >
                {brandStatus.message}
              </p>
            )}
          </div>

          {/* ── Brand filter ── */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                My Brands
              </p>
              <span className="text-xs text-zinc-600">
                {visibleCount}/{brands.length} visible
              </span>
            </div>

            {brands.length === 0 ? (
              <p className="text-sm text-zinc-600">No brands yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {brands.map((b) => {
                  const key = rootDomain(b.domain);
                  const isVisible = !hiddenBrands.has(key);
                  return (
                    <li key={b.domain}>
                      <button
                        onClick={() => onToggleBrand(key)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                          isVisible
                            ? "bg-zinc-900 hover:bg-zinc-800"
                            : "opacity-40 hover:opacity-60"
                        }`}
                      >
                        {/* Mini logo */}
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={logoUrl(b.domain)}
                            alt={b.name}
                            className="w-7 h-7 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                        <span className="flex-1 text-left text-sm text-zinc-200 truncate">
                          {b.name}
                        </span>
                        {/* Toggle indicator */}
                        <div
                          className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
                            isVisible ? "bg-blue-500" : "bg-zinc-700"
                          }`}
                        >
                          <div
                            className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${
                              isVisible ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const newestIdRef = useRef<string | null>(null);

  // Burger menu
  const [menuOpen, setMenuOpen] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [hiddenBrands, setHiddenBrands] = useState<Set<string>>(new Set());

  // ── Fetch brands for the menu ──────────────────────────────────────────────
  useEffect(() => {
    setHiddenBrands(getHiddenBrands());
    fetch("/api/brands")
      .then((r) => r.json())
      .then((d) => setBrands(d.brands ?? []))
      .catch(() => {});
  }, []);

  // ── Toggle a brand in/out of the hidden set ────────────────────────────────
  const handleToggleBrand = useCallback((domain: string) => {
    setHiddenBrands((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }
      saveHiddenBrands(next);
      return next;
    });
  }, []);

  // ── Feed fetching ─────────────────────────────────────────────────────────
  const fetchPromotions = useCallback(async (offset: number, append = false) => {
    try {
      const res = await fetch(
        `/api/promotions?limit=${PAGE_SIZE}&offset=${offset}`
      );
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

  const pollForNew = useCallback(async () => {
    if (!newestIdRef.current) return;
    try {
      const res = await fetch(`/api/promotions?limit=${PAGE_SIZE}&offset=0`);
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

  useEffect(() => {
    setRead(getRead());
    fetchPromotions(0).finally(() => setLoading(false));
  }, [fetchPromotions]);

  useEffect(() => {
    const id = setInterval(pollForNew, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollForNew]);

  const handleRead = useCallback((id: string) => {
    markRead(id);
    setRead((prev) => new Set(prev).add(id));
  }, []);

  // ── Infinite scroll ────────────────────────────────────────────────────────
  // Keep a stable ref to loadMore so the IntersectionObserver never needs to
  // be torn down and recreated (which caused it to miss re-triggers when the
  // sentinel was already in view after a page loaded).
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  hasMoreRef.current = hasMore;

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    await fetchPromotions(offsetRef.current, true);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [fetchPromotions]);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreRef.current(); },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // ← intentionally empty deps: observer is created once, always calls the
    //   latest loadMore via the ref above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filtered feed ─────────────────────────────────────────────────────────
  const visiblePromotions = promotions.filter(
    (p) => !hiddenBrands.has(rootDomain(p.brand_domain))
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-zinc-950/85 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white tracking-tight">PromoFeed</h1>
        <button
          onClick={() => setMenuOpen(true)}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Open menu"
        >
          {/* Burger icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>

      <main className="max-w-[480px] mx-auto px-3 py-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
          </div>
        ) : visiblePromotions.length === 0 ? (
          <p className="text-center text-zinc-600 py-16 text-sm">
            {promotions.length === 0
              ? "No promotions yet."
              : "All brands are hidden — turn some back on in the menu."}
          </p>
        ) : (
          <>
            {visiblePromotions.map((p) => (
              <PromotionCard
                key={p.id}
                promo={p}
                isRead={read.has(p.id)}
                onRead={handleRead}
              />
            ))}

            {/* Sentinel — always rendered so the observer can fire */}
            <div ref={sentinelRef} className="h-8" />

            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
              </div>
            )}

            {!hasMore && (
              <p className="text-center text-zinc-700 py-6 text-xs tracking-wide">
                You&apos;re all caught up
              </p>
            )}
          </>
        )}
      </main>

      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        brands={brands}
        hiddenBrands={hiddenBrands}
        onToggleBrand={handleToggleBrand}
      />
    </div>
  );
}
