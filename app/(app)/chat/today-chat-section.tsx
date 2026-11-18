"use client";

import { PageSection } from "@ui/page";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { focusLost } from "./chat-focus";

type TodayChatValue = {
  /** An announcement here was confirmed, or went: Today is drawn again without it. */
  settled: (message: string) => void;
};

const TodayChatContext = createContext<TodayChatValue | null>(null);

/** The section an announcement on Today is in, if any. */
export function useTodayChat(): TodayChatValue | null {
  return useContext(TodayChatContext);
}

/**
 * Chat's section on Today, on the client for one thing: when Today is drawn
 * again without the announcement just confirmed there, the keyboard's focus
 * goes on to the next one waiting ("קראתי" where the last one was), or to
 * the section's title when none is left, never to the top of the page.
 */
export function TodayChatSection({
  title,
  action,
  waiting,
  className,
  children,
}: {
  title: string;
  action: ReactNode;
  /** The announcements waiting, in their order on screen. */
  waiting: readonly string[];
  className?: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const waitingNow = useRef(waiting);
  useLayoutEffect(() => {
    waitingNow.current = waiting;
  }, [waiting]);
  /** The one settled here, and where it stood. */
  const done = useRef<{ id: string; at: number } | null>(null);
  const settled = useCallback((message: string) => {
    done.current = {
      id: message,
      at: Math.max(0, waitingNow.current.indexOf(message)),
    };
  }, []);

  useEffect(() => {
    const was = done.current;
    if (!was || waiting.includes(was.id)) return;
    done.current = null;
    if (!focusLost()) return;
    const next = waiting[Math.min(was.at, waiting.length - 1)];
    const button = next
      ? body.current?.querySelector<HTMLElement>(
          `[data-today-announcement="${CSS.escape(next)}"] [data-announcement-confirm]`,
        )
      : null;
    (button ?? heading.current)?.focus({ preventScroll: true });
  }, [waiting]);

  const value = useMemo(() => ({ settled }), [settled]);
  return (
    <TodayChatContext.Provider value={value}>
      <PageSection
        title={title}
        action={action}
        headingRef={heading}
        className={className}
      >
        <div ref={body} className="flex min-w-0 flex-col gap-3">
          {children}
        </div>
      </PageSection>
    </TodayChatContext.Provider>
  );
}
