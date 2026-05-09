"use client";

// app/page.tsx  —  Clean carousel implementation using CSS transforms
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromotionImage {
  url: string;
  role: string;
}

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
  images: PromotionImage[];
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

// ─── Debug logger ─────────────────────────────────────────────────────────────

declare global {
  interface Window { __pf_logs?: string[]; }
}

function pflog(...args: unknown[]) {
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  // eslint-disable-next-line no-console
  console.log("[PF]", ...args);
  if (typeof window !== "undefined") {
    window.__pf_logs ??= [];
    window.__pf_logs.push(`${new Date().toISOString()} ${msg}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CC_TLDS = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

function rootDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return domain;
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
  } catch { return new Set(); }
}

function markRead(id: string) {
  try {
    const s = getRead();
    s.add(id);
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...s]));
  } catch {}
}

function getHiddenBrands(): Set<string> {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${HIDDEN_BRANDS_COOKIE}=([^;]*)`));
    if (!match) return new Set();
    return new Set(JSON.parse(decodeURIComponent(match[1])));
  } catch { return new Set(); }
}

function saveHiddenBrands(hidden: Set<string>) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${HIDDEN_BRANDS_COOKIE}=${encodeURIComponent(JSON.stringify([...hidden]))}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function PromotionCard({ promo, isRead, onRead }: { promo: Promotion; isRead: boolean; onRead: (id: string) => void; }) {
  const ref = useRef<HTMLDivElement>(null);
  const [logoError, setLogoError] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const visibleImages = promo.images.filter((_, i) => !brokenImages.has(i));
  const hasImage = visibleImages.length > 0;
  const hasCarousel = visibleImages.length > 1;

  // Read tracking
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

  // Carousel navigation
  const goToSlide = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(index, visibleImages.length - 1)));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setTouchEnd(e.touches[0].clientX);
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.touches[0].clientX);
    const diff = Math.abs(touchStart - e.touches[0].clientX);
    if (diff > 10 && !isSwiping) {
      setIsSwiping(true);
    }
  };

  const handleTouchEnd = () => {
    const swipeDistance = touchStart - touchEnd;
    const threshold = 50;
    if (Math.abs(swipeDistance) > threshold) {
      if (swipeDistance > 0) goToSlide(activeIndex + 1);
      else goToSlide(activeIndex - 1);
    }
    setTimeout(() => setIsSwiping(false), 100);
  };

  // Prevent link click if user just finished swiping
  const handleCardClick = (e: React.MouseEvent) => {
    if (isSwiping) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  function CardHeader({ overlay }: { overlay: boolean }) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center ring-1 ring-white/20">
          {!logoError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl(promo.brand_domain)} alt={promo.brand_name} className="w-8 h-8 object-contain" onError={() => setLogoError(true)} />
          ) : (
            <span className="text-xs font-bold text-white uppercase">{promo.brand_name.charAt(0)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className={`font-semibold text-sm ${overlay ? "text-white drop-shadow" : "text-zinc-100"}`}>{promo.brand_name}</span>
          <span className={`text-xs ml-2 ${overlay ? "text-white/55" : "text-zinc-500"}`}>{timeAgo(promo.created_at)}</span>
        </div>
        {promo.source === "web" && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/25 text-blue-300 font-medium border border-blue-400/30">web</span>
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
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">{promo.discount_text}</span>
          )}
          {promo.promo_code && (
            <span className="text-xs px-2 py-0.5 rounded font-mono bg-white/10 text-white/80 tracking-wider border border-white/20">{promo.promo_code}</span>
          )}
          {promo.expiry_date && (
            <span className={`text-xs ${overlay ? "text-white/50" : "text-zinc-500"}`}>until {new Date(promo.expiry_date).toLocaleDateString()}</span>
          )}
        </div>
        <p className={`font-bold text-[17px] leading-snug mb-1 ${overlay ? "text-white drop-shadow" : "text-zinc-100"}`}>{promo.title}</p>
        {promo.description && (
          <p className={`text-sm leading-relaxed line-clamp-2 ${overlay ? "text-white/65" : "text-zinc-400"}`}>{promo.description}</p>
        )}
        <span className={`inline-block mt-2 text-[11px] uppercase tracking-wider ${overlay ? "text-white/35" : "text-zinc-600"}`}>{promo.category}</span>
      </>
    );
  }

  return (
    <div
      ref={ref}
      className="block rounded-2xl overflow-hidden group select-none transition-transform duration-200 active:scale-[0.99]"
    >
      <a
        href={promo.click_url ?? `https://${rootDomain(promo.brand_domain)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleCardClick}
        className="block"
      >
        {hasImage ? (
          <div className="relative" style={{ aspectRatio: "4/5" }}>
            {/* Carousel viewport */}
            <div className="absolute inset-0 overflow-hidden">
              {/* Image strip - translates to show active slide */}
              <div
                className="flex h-full transition-transform duration-300 ease-out"
                style={{ transform: `translateX(-${activeIndex * 100}%)` }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {promo.images.map((img, i) => {
                  if (brokenImages.has(i)) return null;
                  return (
                    <div key={i} className="flex-none w-full h-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.url}
                        alt={`${promo.title} — ${i + 1}`}
                        className="w-full h-full object-cover"
                        draggable={false}
                        onError={() => setBrokenImages((prev) => new Set(prev).add(i))}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top gradient + header */}
            <div className="absolute inset-x-0 top-0 z-10 px-4 pt-4 pb-12 pointer-events-none"
                 style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.70) 0%, transparent 100%)" }}>
              <CardHeader overlay />
            </div>

            {/* Navigation (arrows + dots) */}
            {hasCarousel && (
              <>
                {/* Dots */}
                <div className="absolute z-10 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none" style={{ bottom: "42%" }}>
                  {visibleImages.map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-full transition-all duration-200 ${
                        i === activeIndex ? "w-2 h-2 bg-white shadow-[0_0_4px_rgba(0,0,0,0.6)]" : "w-1.5 h-1.5 bg-white/55"
                      }`}
                    />
                  ))}
                </div>

                {/* Left arrow */}
                {activeIndex > 0 && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToSlide(activeIndex - 1); }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto"
                    aria-label="Previous"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                )}

                {/* Right arrow */}
                {activeIndex < visibleImages.length - 1 && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToSlide(activeIndex + 1); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto"
                    aria-label="Next"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                )}
              </>
            )}

            {/* Bottom gradient + body */}
            <div className="absolute inset-x-0 bottom-0 z-10 px-4 pb-5 pt-20 pointer-events-none"
                 style={{ background: "linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)" }}>
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
    </div>
  );
}

// ─── Side Menu ────────────────────────────────────────────────────────────────

function SideMenu({ open, onClose, brands, hiddenBrands, onToggleBrand }: {
  open: boolean; onClose: () => void; brands: Brand[]; hiddenBrands: Set<string>; onToggleBrand: (domain: string) => void;
}) {
  const [brandInput, setBrandInput] = useState("");
  const [brandStatus, setBrandStatus] = useState<{ type: "exists" | "new" | "error" | null; message: string; }>({ type: null, message: "" });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function handleAddBrand() {
    const name = brandInput.trim();
    if (!name) return;
    setChecking(true);
    setBrandStatus({ type: null, message: "" });
    try {
      const res = await fetch(`/api/brands?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.exists) {
        setBrandStatus({ type: "exists", message: `${name} is already in PromoFeed!` });
      } else {
        await fetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
        setBrandStatus({ type: "new", message: `We will add ${name} very soon to PromoFeed.` });
      }
    } catch {
      setBrandStatus({ type: "error", message: "Something went wrong. Try again." });
    } finally {
      setChecking(false);
    }
  }

  const visibleCount = brands.filter((b) => !hiddenBrands.has(rootDomain(b.domain))).length;

  return (
    <>
      <div className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} onClick={onClose} />
      <div className={`fixed top-0 right-0 z-40 h-full w-80 max-w-[90vw] bg-zinc-950 border-l border-white/[0.07] flex flex-col transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <span className="font-bold text-white text-base">Manage Feed</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1" aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 border-b border-white/[0.07]">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Add a Brand</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={brandInput}
                onChange={(e) => { setBrandInput(e.target.value); setBrandStatus({ type: null, message: "" }); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddBrand(); }}
                placeholder="e.g. Zara, ASOS…"
                className="flex-1 bg-zinc-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
              />
              <button onClick={handleAddBrand} disabled={checking || !brandInput.trim()} className="px-3 py-2 rounded-lg bg-white text-zinc-950 text-sm font-semibold disabled:opacity-40 transition-opacity hover:bg-zinc-200">
                {checking ? "…" : "Add"}
              </button>
            </div>
            {brandStatus.type && (
              <p className={`mt-2 text-xs leading-snug ${brandStatus.type === "exists" ? "text-emerald-400" : brandStatus.type === "new" ? "text-blue-400" : "text-red-400"}`}>
                {brandStatus.message}
              </p>
            )}
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">My Brands</p>
              <span className="text-xs text-zinc-600">{visibleCount}/{brands.length} visible</span>
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
                      <button onClick={() => onToggleBrand(key)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isVisible ? "bg-zinc-900 hover:bg-zinc-800" : "opacity-40 hover:opacity-60"}`}>
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-white/10 flex-shrink-0 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logoUrl(b.domain)} alt={b.name} className="w-7 h-7 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                        <span className="flex-1 text-left text-sm text-zinc-200 truncate">{b.name}</span>
                        <div className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${isVisible ? "bg-blue-500" : "bg-zinc-700"}`}>
                          <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${isVisible ? "translate-x-4" : "translate-x-0.5"}`} />
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
  const [initialized, setInitialized] = useState(false);
  const offsetRef = useRef(0);
  const newestIdRef = useRef<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [hiddenBrands, setHiddenBrands] = useState<Set<string>>(new Set());

  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const hiddenBrandsRef = useRef(hiddenBrands);
  hasMoreRef.current = hasMore;
  hiddenBrandsRef.current = hiddenBrands;

  const buildExcludeParam = (hidden: Set<string>) =>
    hidden.size > 0 ? `&exclude=${encodeURIComponent([...hidden].join(","))}` : "";

  const fetchPromotions = useCallback(async (offset: number, append: boolean) => {
    const exclude = buildExcludeParam(hiddenBrandsRef.current);
    const url = `/api/promotions?limit=${PAGE_SIZE}&offset=${offset}${exclude}`;
    pflog("fetch.start", { offset, append, exclude: [...hiddenBrandsRef.current] });
    try {
      const res = await fetch(url);
      const data = await res.json();
      const incoming: Promotion[] = data.promotions ?? [];
      pflog("fetch.done", { offset, append, received: incoming.length, firstId: incoming[0]?.id ?? null });
      setPromotions((prev) => (append ? [...prev, ...incoming] : incoming));
      setHasMore(incoming.length === PAGE_SIZE);
      offsetRef.current = offset + incoming.length;
      if (!append && incoming.length > 0) newestIdRef.current = incoming[0].id;
    } catch (err) {
      pflog("fetch.error", String(err));
    }
  }, []);

  const pollForNew = useCallback(async () => {
    if (!newestIdRef.current) return;
    try {
      const exclude = buildExcludeParam(hiddenBrandsRef.current);
      const res = await fetch(`/api/promotions?limit=${PAGE_SIZE}&offset=0${exclude}`);
      const data = await res.json();
      const incoming: Promotion[] = data.promotions ?? [];
      const newestIdx = incoming.findIndex((x) => x.id === newestIdRef.current);
      const newItems = newestIdx === -1 ? incoming : incoming.slice(0, newestIdx);
      if (newItems.length > 0) {
        setPromotions((prev) => [...newItems, ...prev]);
        newestIdRef.current = newItems[0].id;
        offsetRef.current += newItems.length;
      }
    } catch (err) {
      pflog("poll.error", String(err));
    }
  }, []);

  const handleRead = useCallback((id: string) => {
    markRead(id);
    setRead((prev) => new Set(prev).add(id));
  }, []);

  const handleToggleBrand = useCallback((domain: string) => {
    setHiddenBrands((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      saveHiddenBrands(next);
      return next;
    });
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current) {
      pflog("loadMore.skip", { loadingMore: loadingMoreRef.current, hasMore: hasMoreRef.current });
      return;
    }
    pflog("loadMore.run", { offset: offsetRef.current });
    loadingMoreRef.current = true;
    setLoadingMore(true);
    await fetchPromotions(offsetRef.current, true);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [fetchPromotions]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  useEffect(() => {
    pflog("mount");
    setRead(getRead());
    const hidden = getHiddenBrands();
    setHiddenBrands(hidden);
    fetch("/api/brands")
      .then((r) => r.json())
      .then((d) => setBrands(d.brands ?? []))
      .catch((err) => pflog("mount.brands.error", String(err)));
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    pflog("filter.refetch", { hidden: [...hiddenBrands] });
    setLoading(true);
    offsetRef.current = 0;
    newestIdRef.current = null;
    setHasMore(true);
    fetchPromotions(0, false).finally(() => setLoading(false));
  }, [hiddenBrands, initialized, fetchPromotions]);

  useEffect(() => {
    const id = setInterval(pollForNew, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pollForNew]);

  const observerInstanceRef = useRef<IntersectionObserver | null>(null);
  const sentinelCallback = useCallback((node: HTMLDivElement | null) => {
    if (observerInstanceRef.current) {
      pflog("observer.disconnect");
      observerInstanceRef.current.disconnect();
      observerInstanceRef.current = null;
    }
    if (!node) { pflog("observer.detach"); return; }
    pflog("observer.attach");
    observerInstanceRef.current = new IntersectionObserver(
      ([entry]) => {
        pflog("observer.fire", { isIntersecting: entry.isIntersecting });
        if (entry.isIntersecting) loadMoreRef.current();
      },
      { threshold: 0, rootMargin: "300px" }
    );
    observerInstanceRef.current.observe(node);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-20 bg-zinc-950/85 backdrop-blur-md border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white tracking-tight">PromoFeed</h1>
        <button onClick={() => setMenuOpen(true)} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors" aria-label="Open menu">
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
        ) : promotions.length === 0 ? (
          <p className="text-center text-zinc-600 py-16 text-sm">
            {hiddenBrands.size > 0 ? "All brands are hidden — turn some back on in the menu." : "No promotions yet."}
          </p>
        ) : (
          <>
            {promotions.map((p) => (
              <PromotionCard key={p.id} promo={p} isRead={read.has(p.id)} onRead={handleRead} />
            ))}
            <div ref={sentinelCallback} className="h-8" />
            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-300 rounded-full animate-spin" />
              </div>
            )}
            {!hasMore && (
              <p className="text-center text-zinc-700 py-6 text-xs tracking-wide">You&apos;re all caught up</p>
            )}
          </>
        )}
      </main>

      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} brands={brands} hiddenBrands={hiddenBrands} onToggleBrand={handleToggleBrand} />
    </div>
  );
}
