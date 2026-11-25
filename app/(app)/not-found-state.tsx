"use client";

import { EmptyState } from "@ui/empty-state";
import { focusFirst } from "@ui/focus-after";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * The app's not-found screen: what happened and the way on. Its title takes
 * the keyboard's focus when nothing holds it as the screen comes, without
 * moving the page: drawn again in place of a screen that went from under
 * the focus (a chat closed to its reader as they sent in it, or chat turned
 * off), a screen reader hears where it is now. Anywhere the person put the
 * focus, it stays.
 */
export function NotFoundState({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  body: ReactNode;
  /** What to do next. */
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    focusFirst([heading.current], { preventScroll: true, title: false });
  }, []);
  return (
    <EmptyState icon={icon} title={title} body={body} headingRef={heading}>
      {children}
    </EmptyState>
  );
}
