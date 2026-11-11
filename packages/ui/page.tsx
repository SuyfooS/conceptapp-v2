"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  type ComponentProps,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "./cn";

/**
 * Page frame used inside AppShell. Width and spacing grow with the device:
 * phone 16px gutters, tablet 24px, desktop 32px with a readable max width. It
 * fades in as it replaces a skeleton. Opacity only: a moving page would become
 * the frame of its fixed parts, such as the floating title, for that moment.
 */
export function PageBody({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-7xl animate-[page-in_180ms_var(--ease-calm)] flex-col gap-6 px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-5 md:gap-8 md:px-6 md:py-8 xl:px-8",
        className,
      )}
      {...props}
    />
  );
}

export type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small line above the title, such as the date. */
  eyebrow?: ReactNode;
  /** Where "back" goes, on a screen one level down. Its label names that place. */
  back?: { href: string; label: string };
  /**
   * The page's main action(s). Full width under the title on phones (easy to
   * hit with a thumb), inline at the end of the header from tablet up.
   */
  actions?: ReactNode;
};

/**
 * The large title. When it scrolls away, a small glass pill with the same
 * title floats at the top, over a soft fade of the content.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  back,
  actions,
}: PageHeaderProps) {
  const header = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry?.isIntersecting),
      { rootMargin: "-40px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      ref={header}
      className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        {back ? (
          <Link
            href={back.href}
            className="pressable -ms-1 mb-2 flex min-h-11 items-center gap-0.5 self-start rounded-full pe-3 font-medium text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronRight
              aria-hidden="true"
              className="size-5 ltr:-scale-x-100"
            />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <p className="text-base text-ink-2">{eyebrow}</p> : null}
        <h1 className="text-balance font-bold text-2xl">{title}</h1>
        {subtitle ? <p className="text-base text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center [&>*]:w-full md:[&>*]:w-auto">
          {actions}
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className={cn(
          "edge-fade-top pointer-events-none fixed inset-x-0 top-0 z-20 h-[calc(env(safe-area-inset-top)+5.5rem)] transition-opacity duration-200 xl:hidden",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "glass pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30 mx-auto flex min-h-10 w-fit max-w-[70%] items-center rounded-full px-[18px] font-semibold text-base xl:hidden",
          "transition-[opacity,translate,scale] duration-500 ease-spring",
          scrolled
            ? "translate-y-0 scale-100 opacity-100"
            : "-translate-y-3.5 scale-90 opacity-0",
        )}
      >
        {title}
      </div>
    </header>
  );
}

export function PageSection({
  title,
  action,
  level = 2,
  headingRef,
  className,
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  /** 3 for a section inside another section. */
  level?: 2 | 3;
  /**
   * The title, for a screen that puts the keyboard's focus there when what
   * held it goes away (a notice put away above the section).
   */
  headingRef?: Ref<HTMLHeadingElement>;
  className?: string;
  children: ReactNode;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <section className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-3 px-1">
        <Heading
          ref={headingRef}
          tabIndex={headingRef ? -1 : undefined}
          className="font-bold text-lg outline-none"
        >
          {title}
        </Heading>
        {action}
      </div>
      {children}
    </section>
  );
}
