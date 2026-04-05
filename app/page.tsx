"use client";

// app/page.tsx
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────

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
  click_url: string | null;
  created_at: string;
}

// ─── localStorage helpers ─────────────────────────────────────────────────

const STORAGE_KEY = "promofeed:seen";

function loadSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage quota exceeded — non-fatal
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatExpiry(iso: string): string {
  return "Ends " + new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sectionLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

// Deterministic brand color from name — maps to one of 5 Tailwind-safe combos
const BRAND_COLORS = [
  "bg-teal-100 text-teal-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-sky-100 text-sky-800",
];

function brandColor(name: string): string {
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return BRAND_COLORS[hash % BRAND_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

// ─── PromoCard ────────────────────────────────────────────────────────────

function PromoCard({
  promo,
  isUnread,
  onRead,
  cardRef,
}: {
  promo: Promotion;
  isUnread: boolean;
  onRead: (id: string) => void;
  cardRef: (el: HTMLDivElement | null) => void;
}) {
  function handleClick() {
    onRead(promo.id);
    if (promo.click_url) {
      window.open(promo.click_url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div
      ref={cardRef}
      data-id={promo.id}
      onClick={handleClick}
      className={[
        "relative px-4 py-4 border-b border-zinc-100 dark:border-zinc-800 transition-colors",
        promo.click_url ? "cursor-pointer" : "cursor-default",
        isUnread
          ? "bg-blue-50 dark:bg-blue-950/30 hover:bg-blue-100 dark:hover:bg-blue-950/50"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-900",
      ].join(" ")}
    >
      {/* Unread accent bar */}
      {isUnread && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-r" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2 pl-1">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ${brandColor(promo.brand_name)}`}
          >
            {initials(promo.brand_name)}
          </span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {promo.brand_name}
          </span>
        </div>
        <span className="text-xs text-zinc-400 dark:text-zinc-500 flex-shrink-0 ml-3">
          {relativeTime(promo.created_at)}
        </span>
      </div>

      {/* Body */}
      <div className="pl-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2 mb-1">
          {promo.title}
        </p>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-snug line-clamp-2 mb-3">
          {promo.description}
        </p>

        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {promo.discount_text && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
              {promo.discount_text}
            </span>
          )}
          {promo.promo_code && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              {promo.promo_code}
            </span>
          )}
          {promo.expiry_date && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              {formatExpiry(promo.expiry_date)}
            </span>
          )}
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 capitalize">
            {promo.category}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Nav icons (inline SVG, no extra dep) ────────────────────────────────

function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);

  // Timers tracking how long each card has been visible
  const visibilityTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // IntersectionObserver instance
  const observerRef = useRef<IntersectionObserver | null>(null);

  // ── Load seen IDs from localStorage on mount
  useEffect(() => {
    setSeenIds(loadSeenIds());
  }, []);

  // ── Fetch promotions
  const fetchPromos = useCallback(async () => {
    try {
      const res = await fetch("/api/promotions");
      if (!res.ok) return;
      const data: Promotion[] = await res.json();
      setPromos(data);
    } catch {
      // silently ignore network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromos();
    const interval = setInterval(fetchPromos, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPromos]);

  // ── Mark a single promotion as read
  const markRead = useCallback((id: string) => {
    setSeenIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveSeenIds(next);
      return next;
    });
  }, []);

  // ── IntersectionObserver — mark as read after 1.5 s of continuous visibility
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = (entry.target as HTMLElement).dataset.id;
          if (!id) return;

          if (entry.isIntersecting) {
            if (!visibilityTimers.current.has(id)) {
              const timer = setTimeout(() => {
                markRead(id);
                visibilityTimers.current.delete(id);
              }, 1500);
              visibilityTimers.current.set(id, timer);
            }
          } else {
            const timer = visibilityTimers.current.get(id);
            if (timer) {
              clearTimeout(timer);
              visibilityTimers.current.delete(id);
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => {
      observerRef.current?.disconnect();
      visibilityTimers.current.forEach(clearTimeout);
      visibilityTimers.current.clear();
    };
  }, [markRead]);

  // Callback ref: attach/detach each card to the observer
  const cardRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) observerRef.current?.observe(el);
    },
    []
  );

  // ── Derived state
  const unreadCount = promos.filter((p) => !seenIds.has(p.id)).length;

  function scrollToFirstUnread() {
    firstUnreadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ── Section divider logic
  function getSectionLabel(promo: Promotion, index: number): string | null {
    const label = sectionLabel(promo.created_at);
    if (index === 0) return label;
    const prevLabel = sectionLabel(promos[index - 1].created_at);
    return label !== prevLabel ? label : null;
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex justify-center">
      <div className="w-full max-w-2xl flex">

        {/* ── Sidebar (desktop) ── */}
        <aside className="hidden sm:flex flex-col items-center gap-5 px-3 pt-4 w-14 flex-shrink-0 border-r border-zinc-100 dark:border-zinc-800">
          {/* Logo */}
          <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center mb-2">
            <span className="text-white dark:text-zinc-900 text-sm font-bold">P</span>
          </div>

          {/* Nav items */}
          {[
            { icon: <IconHome />, label: "Feed", active: true },
            { icon: <IconSearch />, label: "Search", active: false },
            { icon: <IconHeart />, label: "Saved", active: false },
            { icon: <IconBell />, label: "Notifications", active: false },
          ].map(({ icon, label, active }) => (
            <button
              key={label}
              aria-label={label}
              disabled={!active}
              className={[
                "w-11 h-11 rounded-lg flex items-center justify-center transition-colors",
                active
                  ? "text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700"
                  : "text-zinc-400 dark:text-zinc-600 cursor-not-allowed",
              ].join(" ")}
            >
              {icon}
            </button>
          ))}
        </aside>

        {/* ── Main feed ── */}
        <main className="flex-1 min-w-0 flex flex-col">

          {/* Feed header */}
          <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-white/80 dark:bg-zinc-950/80 backdrop-blur border-b border-zinc-100 dark:border-zinc-800">
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              PromoFeed
            </h1>
            {unreadCount > 0 && (
              <button
                onClick={scrollToFirstUnread}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors min-h-[44px] sm:min-h-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {unreadCount} new
              </button>
            )}
          </header>

          {/* Feed content */}
          <div className="flex-1">
            {loading && (
              <p className="text-sm text-zinc-400 dark:text-zinc-600 text-center py-16">
                Loading...
              </p>
            )}

            {!loading && promos.length === 0 && (
              <p className="text-sm text-zinc-400 dark:text-zinc-600 text-center py-16">
                No promotions yet.
              </p>
            )}

            {promos.map((promo, i) => {
              const isUnread = !seenIds.has(promo.id);
              const sectionHeading = getSectionLabel(promo, i);
              const isFirstUnread = isUnread && i === promos.findIndex((p) => !seenIds.has(p.id));

              return (
                <div key={promo.id}>
                  {sectionHeading && (
                    <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                        {sectionHeading}
                      </span>
                      <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
                    </div>
                  )}
                  <PromoCard
                    promo={promo}
                    isUnread={isUnread}
                    onRead={markRead}
                    cardRef={(el) => {
                      cardRef(el);
                      if (isFirstUnread && el) firstUnreadRef.current = el;
                    }}
                  />
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {/* ── Bottom nav (mobile) ── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 flex border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        {[
          { icon: <IconHome />, label: "Feed", active: true },
          { icon: <IconSearch />, label: "Search", active: false },
          { icon: <IconHeart />, label: "Saved", active: false },
          { icon: <IconBell />, label: "Notifications", active: false },
        ].map(({ icon, label, active }) => (
          <button
            key={label}
            aria-label={label}
            disabled={!active}
            className={[
              "flex-1 flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] text-[10px] transition-colors",
              active
                ? "text-zinc-900 dark:text-zinc-100"
                : "text-zinc-400 dark:text-zinc-600",
            ].join(" ")}
          >
            {icon}
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
