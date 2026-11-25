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
 * focus, it stays, unless `takesFocus` says the title takes it from there.
 */
export function NotFoundState({
  icon,
  title,
  body,
  children,
  takesFocus,
}: {
  icon: ReactNode;
  title: ReactNode;
  body: ReactNode;
  /** What to do next. */
  children?: ReactNode;
  /**
   * Whether the title takes the focus as the screen comes, asked once then;
   * by default only when nothing holds it. The chat's, beside the list from
   * tablet up, takes it as a chat's title does (`titleTakesFocus`): from the
   * row or the button that opened it too.
   */
  takesFocus?: () => boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const asked = useRef(takesFocus);
  useEffect(() => {
    const takes = asked.current;
    if (takes && !takes()) return;
    focusFirst([heading.current], {
      preventScroll: true,
      title: false,
      onlyIfLost: !takes,
    });
  }, []);
  return (
    <EmptyState icon={icon} title={title} body={body} headingRef={heading}>
      {children}
    </EmptyState>
  );
}
