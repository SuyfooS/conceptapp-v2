"use client";

import { PageHeader, type PageHeaderProps } from "@ui/page";
import { useEffect, useRef } from "react";
import { titleTakesFocus } from "./chat-focus";

/**
 * A chat page's large title (/chat/announcements, a conversation's details
 * on a phone), which takes the keyboard's focus when the page opens with
 * nothing focused: on a phone the list row or the title that opened it has
 * just gone (hidden, kept for going back), and a screen reader starts here,
 * as it does on a conversation. From tablet up, the row that opened it
 * stays in the list beside it, and gives it the focus too.
 */
export function ChatPageHeader(props: Omit<PageHeaderProps, "headingRef">) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (titleTakesFocus()) heading.current?.focus({ preventScroll: true });
  }, []);
  return <PageHeader {...props} headingRef={heading} />;
}
