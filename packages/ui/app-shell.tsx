"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
  /** At most five items: the phone tab bar has room for five. */
  nav: NavItem[];
  children: ReactNode;
};

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Count({ value }: { value?: number }) {
  if (!value) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="min-w-5 rounded-full bg-danger px-1.5 text-center font-bold text-[11px] text-white leading-5"
      >
        {value}
      </span>
      <span className="sr-only">, {value} דורשים טיפול</span>
    </>
  );
}

/**
 * The frame of the business app. One component, three layouts:
 *
 * - phone (< 768px): bottom tab bar, one column, actions within thumb reach
 * - tablet (768–1279px): side rail with icon + label, two columns where useful
 * - desktop (≥ 1280px): full sidebar with business and user, multi-column content
 *
 * All three navigations are rendered and CSS shows one, so there is no
 * flash or layout jump while the page loads. Items, labels, icons and order
 * are identical everywhere, so moving between devices needs no relearning.
 */
export function AppShell({ businessName, user, nav, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-bg">
      {/* desktop: full sidebar */}
      <aside className="fixed inset-y-0 start-0 z-20 hidden w-64 flex-col border-line border-e bg-surface xl:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-control bg-accent font-bold text-accent-ink"
          >
            {businessName.slice(0, 1)}
          </span>
          <span className="truncate font-bold text-md">{businessName}</span>
        </div>
        <nav
          aria-label="ניווט ראשי"
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
                  "flex h-11 items-center gap-3 rounded-control px-3 font-medium transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
                  active
                    ? "bg-accent-soft text-ink"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("flex [&_svg]:size-5", active && "text-accent")}
                >
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                <Count value={item.count} />
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 border-line border-t px-5 py-4">
          <span className="flex size-9 items-center justify-center rounded-full bg-surface-2 font-medium text-ink-2 text-sm">
            {user.name.slice(0, 1)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-ink-2 text-sm">{user.role}</span>
          </span>
        </div>
      </aside>

      {/* tablet: side rail */}
      <nav
        aria-label="ניווט ראשי"
        className="fixed inset-y-0 start-0 z-20 hidden w-22 flex-col items-center gap-1 border-line border-e bg-surface py-4 md:flex xl:hidden"
      >
        <span
          aria-hidden="true"
          className="mb-3 flex size-10 items-center justify-center rounded-control bg-accent font-bold text-accent-ink"
        >
          {businessName.slice(0, 1)}
        </span>
        {nav.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex w-18 flex-col items-center gap-1 rounded-control py-2 text-[12px] transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
                active
                  ? "text-ink"
                  : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150",
                  active && "bg-accent-soft",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("flex [&_svg]:size-5", active && "text-accent")}
                >
                  {item.icon}
                </span>
              </span>
              <span className={cn(active && "font-medium")}>{item.label}</span>
              {item.count ? (
                <span className="absolute top-1 end-2">
                  <Count value={item.count} />
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="pb-[calc(4rem+env(safe-area-inset-bottom))] md:ps-22 md:pb-0 xl:ps-64">
        {children}
      </div>

      {/* phone: bottom tab bar */}
      <nav
        aria-label="ניווט ראשי"
        className="fixed inset-x-0 bottom-0 z-20 border-line border-t bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul
          className="grid h-16"
          style={{
            gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))`,
          }}
        >
          {nav.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full flex-col items-center justify-center gap-0.5 text-[12px]",
                    "focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2",
                    active ? "text-ink" : "text-ink-2",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150",
                      active && "bg-accent-soft",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex [&_svg]:size-5",
                        active && "text-accent",
                      )}
                    >
                      {item.icon}
                    </span>
                  </span>
                  <span className={cn(active && "font-medium")}>
                    {item.label}
                  </span>
                  {item.count ? (
                    <span className="absolute top-1.5 start-[calc(50%+0.6rem)]">
                      <Count value={item.count} />
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
