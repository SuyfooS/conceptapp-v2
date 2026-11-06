"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Avatar } from "./avatar";
import { cn } from "./cn";

export type NavItem = {
  href: string;
  label: string;
  /** A rendered icon, e.g. <House />. Elements (not components) so server layouts can pass them. */
  icon: ReactNode;
  /** Match only this exact path (use for the home item). */
  exact?: boolean;
  /** Small count shown on the item, e.g. pending requests. */
  count?: number;
};

export type AppShellProps = {
  businessName: string;
  user: { name: string; role: string };
  /** At most five items: the tab bar has room for five. */
  nav: NavItem[];
  children: ReactNode;
};

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Count({ value, className }: { value?: number; className?: string }) {
  const t = useTranslations("ui.appShell");
  if (!value) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "min-w-[18px] rounded-full bg-danger px-1.5 text-center font-bold text-[11px] text-danger-ink leading-[18px]",
          className,
        )}
      >
        {value}
      </span>
      <span className="sr-only">{t("needsAction", { count: value })}</span>
    </>
  );
}

/**
 * The floating glass tab bar. A lens sits under the current tab and follows a
 * finger dragged along the bar. Scrolling down shrinks the bar to the current
 * tab, out of the content's way. It comes back on a tap, near the top of the
 * page, or after scrolling up a good way, so small movements of a finger reading
 * the page don't keep resizing it. The soft blur under the wide bar goes with it.
 */
/** Below this far from the top of the page, the bar is always full. */
const NEAR_TOP = 40;
/** How far scrolling up has to go before a shrunk bar opens again. */
const OPEN_AFTER = 140;

function TabBar({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();
  const t = useTranslations("ui.appShell");
  const bar = useRef<HTMLUListElement>(null);
  const [compact, setCompact] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const dragStart = useRef<number | null>(null);
  const dragged = useRef(false);

  const activeIndex = nav.findIndex((item) => isActive(pathname, item));
  const lensIndex = drag ?? activeIndex;
  // With one place to go there is nothing to choose between: the bar stays
  // small, its compact shape, and a page's main action can sit beside it.
  const single = nav.length === 1;
  const small = compact || single;

  // A new screen starts with the full bar.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is what triggers the reset
  useEffect(() => {
    setCompact(false);
  }, [pathname]);

  useEffect(() => {
    let last = window.scrollY;
    // Where the climb in progress began: the lowest point since going down.
    let climbFrom = last;
    function onScroll() {
      const y = window.scrollY;
      const delta = y - last;
      if (Math.abs(delta) < 6) return;
      if (delta > 0) {
        climbFrom = y;
        if (y > NEAR_TOP) setCompact(true);
      } else if (y <= NEAR_TOP || climbFrom - y >= OPEN_AFTER) {
        setCompact(false);
      }
      last = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** Which tab a pointer is over, as a fraction of a tab: 0 is the first tab. */
  function positionAt(clientX: number) {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect) return 0;
    const rtl = getComputedStyle(bar.current as Element).direction === "rtl";
    const offset = rtl ? rect.right - clientX : clientX - rect.left;
    const at = (offset / rect.width) * nav.length - 0.5;
    return Math.max(0, Math.min(nav.length - 1, at));
  }

  function onPointerDown(event: PointerEvent<HTMLUListElement>) {
    if (compact) return;
    dragStart.current = event.clientX;
    dragged.current = false;
  }

  function onPointerMove(event: PointerEvent<HTMLUListElement>) {
    if (dragStart.current === null) return;
    if (!dragged.current && Math.abs(event.clientX - dragStart.current) < 8) {
      return;
    }
    dragged.current = true;
    bar.current?.setPointerCapture(event.pointerId);
    setDrag(positionAt(event.clientX));
  }

  function onPointerUp(event: PointerEvent<HTMLUListElement>) {
    dragStart.current = null;
    if (!dragged.current) return;
    const index = Math.round(positionAt(event.clientX));
    const target = nav[index];
    setDrag(null);
    if (target && target.href !== nav[activeIndex]?.href) {
      // Through the link, so a screen guarding unsaved work sees this as it
      // sees a tap. The real click that ends the drag stays swallowed.
      dragged.current = false;
      bar.current?.querySelectorAll("a")[index]?.click();
      dragged.current = true;
    }
  }

  return (
    <>
      <div
        aria-hidden="true"
        data-tab-fade
        className={cn(
          "edge-fade-bottom pointer-events-none fixed inset-x-0 bottom-0 z-20 h-24 transition-opacity duration-200 ease-calm xl:hidden",
          small && "opacity-0",
        )}
      />
      <nav
        aria-label={t("mainNav")}
        // Lets a floating action share the row while the bar is small.
        data-compact={compact || undefined}
        // FloatingDock moves beside the bar while it is shrunk.
        data-tab-compact={compact || undefined}
        className={cn(
          "pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+14px)] z-30 flex xl:hidden",
          "md:justify-center",
        )}
      >
        <ul
          ref={bar}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragStart.current = null;
            setDrag(null);
          }}
          onClickCapture={(event) => {
            // The end of a drag is not a tap on whatever is under the finger.
            if (dragged.current) {
              event.preventDefault();
              event.stopPropagation();
              dragged.current = false;
              return;
            }
            if (compact && !single) {
              event.preventDefault();
              event.stopPropagation();
              setCompact(false);
            }
          }}
          onFocus={() => setCompact(false)}
          className={cn(
            "glass pointer-events-auto relative flex h-16 select-none touch-pan-y rounded-full p-1",
            "transition-[width] duration-500 ease-spring",
            small ? "w-16" : "w-full md:max-w-[480px]",
          )}
        >
          {activeIndex >= 0 ? (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-1 rounded-full bg-[var(--glass-lens)]",
                "shadow-[0_2px_10px_rgb(16_18_26/0.12),inset_0_0.5px_0_var(--glass-edge)]",
                drag === null
                  ? "transition-[inset-inline-start,opacity,scale] duration-500 ease-spring"
                  : "scale-[1.06]",
                small && "opacity-0",
              )}
              style={{
                width: `calc((100% - 8px) / ${nav.length})`,
                insetInlineStart: `calc(4px + (100% - 8px) * ${lensIndex / nav.length})`,
              }}
            />
          ) : null}
          {nav.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li
                key={item.href}
                className={cn(
                  "relative z-10 min-w-0 flex-1 basis-0 transition-[flex-grow,opacity] duration-300",
                  compact &&
                    !active &&
                    !single &&
                    "grow-0 overflow-hidden opacity-0",
                )}
              >
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={single ? item.label : undefined}
                  draggable={false}
                  tabIndex={compact && !active && !single ? -1 : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-px rounded-full",
                    "focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
                    active ? "text-accent" : "text-ink",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex [&_svg]:size-6 [&_svg]:stroke-[1.8]",
                      active &&
                        "[&_svg]:fill-[color-mix(in_srgb,currentColor_24%,transparent)]",
                    )}
                  >
                    {item.icon}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] leading-[14px]",
                      active ? "font-bold" : "font-medium",
                      small && "sr-only",
                    )}
                  >
                    {item.label}
                  </span>
                  {item.count && !small ? (
                    <span className="absolute top-1 start-[calc(50%+6px)]">
                      <Count value={item.count} />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/**
 * The frame of the business app. One component, two navigations:
 *
 * - phone and tablet (< 1280px): a floating glass tab bar; one column on a
 *   phone, two where useful on a tablet
 * - desktop (≥ 1280px): full sidebar with business and user, multi-column content
 *
 * Both are rendered and CSS shows one, so there is no flash or layout jump
 * while the page loads. Items, labels, icons and order are identical
 * everywhere, so moving between devices needs no relearning.
 */
export function AppShell({ businessName, user, nav, children }: AppShellProps) {
  const pathname = usePathname();
  const t = useTranslations("ui.appShell");

  return (
    <div className="min-h-dvh bg-bg">
      {/* desktop: full sidebar */}
      <aside className="fixed inset-y-3 start-3 z-20 hidden w-64 flex-col rounded-card bg-surface shadow-card xl:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-control bg-accent font-bold text-accent-ink"
          >
            {businessName.slice(0, 1)}
          </span>
          <span className="min-w-0 font-bold text-md">{businessName}</span>
        </div>
        <nav
          aria-label={t("mainNav")}
          className="flex flex-1 flex-col gap-1 px-3"
        >
          {nav.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-control px-3 font-medium transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
                  active
                    ? "bg-surface-2 text-ink"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex [&_svg]:size-5",
                    active &&
                      "text-accent [&_svg]:fill-[color-mix(in_srgb,currentColor_24%,transparent)]",
                  )}
                >
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                <Count value={item.count} />
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 px-5 py-4">
          <Avatar name={user.name} />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">{user.name}</span>
            <span className="text-ink-2 text-sm">{user.role}</span>
          </span>
        </div>
      </aside>

      <div className="pb-[calc(env(safe-area-inset-bottom)+6.5rem)] xl:ps-[17.5rem] xl:pb-0">
        {children}
      </div>

      <TabBar nav={nav} />
    </div>
  );
}
