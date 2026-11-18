"use client";

import { AnnouncementCard } from "@ui/announcement-card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import type { ChatActionResult } from "./chat-types";
import { useTodayChat } from "./today-chat-section";

/**
 * An announcement waiting on Today for the person's "קראתי": a quiet button
 * (Today keeps its own main action) and, under it, that management sees who
 * confirmed. Pressed, it shows that they did, and Today is drawn again
 * without it. Removed or unpinned since Today was drawn (or no longer the
 * person's to read), it goes at once, its words with it, as Today is drawn
 * again: Today has no sync of its own.
 */
export function TodayAnnouncement({
  message,
  byline,
  where,
  href,
  body,
  confirm,
}: {
  message: string;
  byline: ReactNode;
  /** The group it was posted in. */
  where: ReactNode;
  /** Its conversation. */
  href: string;
  body: string;
  confirm: (message: string) => Promise<ChatActionResult>;
}) {
  const t = useTranslations("app.chat");
  const router = useRouter();
  const section = useTodayChat();
  const [state, setState] = useState<
    "waiting" | "pending" | "done" | "failed" | "gone"
  >("waiting");

  async function press() {
    setState("pending");
    let result: ChatActionResult;
    try {
      result = await confirm(message);
    } catch {
      result = { ok: false, failure: "failed" };
    }
    if (!result.ok) {
      if (result.failure === "closed" || result.failure === "noAccess") {
        section?.settled(message);
        setState("gone");
        router.refresh();
        return;
      }
      setState("failed");
      return;
    }
    section?.settled(message);
    setState("done");
    router.refresh();
  }

  if (state === "gone") return null;
  return (
    <div data-today-announcement={message}>
      <AnnouncementCard
        tone="flat"
        headingLevel="h3"
        label={t("announcement.label")}
        byline={byline}
        body={body}
        confirm={{
          confirmed: state === "done",
          label: t("announcement.confirm"),
          confirmedLabel: t("announcement.confirmed"),
          onConfirm: () => void press(),
          pending: state === "pending",
          note: t("announcement.whoSees"),
        }}
        footer={
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{where}</span>
            <Link
              href={href}
              className="inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("announcement.page.open")}
            </Link>
            {state === "failed" ? (
              <span role="alert" className="w-full text-danger">
                {t("announcement.confirmFailed")}
              </span>
            ) : null}
          </span>
        }
      />
    </div>
  );
}
