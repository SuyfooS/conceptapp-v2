"use client";

import type { OutboxRow, OutboxWhere } from "@domain/orders-outbox";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { CloudOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { z } from "zod";

/*
 * What waiter mode says outside its screens (P7): a banner above the app's
 * other screens while an order of the person's hasn't gone, and a notice,
 * once, where the page lands after their rounds were taken off the phone
 * (signed out, or no longer a member). Never a toast: the other screens
 * offer their own "ביטול" there. The views take their words as props, for
 * the twin and the gallery too.
 */

/** sessionStorage, outside P4's `orders:` entries: one notice, said once. */
export const LOST_KEY = "orders-lost";

const lostSchema = z.object({
  count: z.int().min(1).max(999),
  places: z.array(z.string().max(200)).max(50),
  why: z.enum(["signedOut", "notMember"]),
});

export type LostNotice = z.infer<typeof lostSchema>;

/**
 * Keeps the notice for where the page lands next: how many rounds were
 * taken off the phone and where, already in words, and why. Nothing of
 * what they held, and nobody's name.
 */
export function keepLostNotice(
  rows: readonly Pick<OutboxRow, "where">[],
  why: LostNotice["why"],
  placeTitle: (where: OutboxWhere) => string,
): void {
  if (rows.length === 0) return;
  try {
    const was = lostSchema.safeParse(
      JSON.parse(sessionStorage.getItem(LOST_KEY) ?? "null"),
    );
    const places = [
      ...new Set([
        ...(was.success ? was.data.places : []),
        ...rows.map((row) => placeTitle(row.where)),
      ]),
    ].slice(0, 50);
    const notice: LostNotice = {
      count: Math.min((was.success ? was.data.count : 0) + rows.length, 999),
      places,
      why,
    };
    sessionStorage.setItem(LOST_KEY, JSON.stringify(notice));
  } catch {
    // Blocked storage: the rounds are gone all the same.
  }
}

/** A card above the screen, as `DepartureNotice` draws one, where the view-as banner sits. */
function NoticeCard({
  label,
  title,
  line,
  action,
  placement,
  className,
}: {
  label: string;
  title: string;
  line: ReactNode;
  action: ReactNode;
  /** Above the app's screen, or inside another screen's own layout. */
  placement: "app" | "inline";
  className?: string;
}) {
  const card = (
    <div className="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-card md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-surface-2 text-ink-2 [&_svg]:size-6 [&_svg]:stroke-[1.8]"
        >
          <CloudOff />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="font-semibold text-base">{title}</p>
          <p className="text-ink-2 text-sm">{line}</p>
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
  return (
    <aside
      aria-label={label}
      className={cn(
        placement === "app" &&
          // No glow on the page under it: it would start in a hard line here.
          "mx-auto w-full max-w-7xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] md:px-6 md:pt-6 xl:px-8 [&+main]:bg-none",
        className,
      )}
    >
      {card}
    </aside>
  );
}

/**
 * Above the app's other screens while an order of the person's here hasn't
 * gone: how many and where, why ("waits" for a connection, "asks" after ten
 * minutes, "refused" back in its draft), and "פתיחה" to its screen, or to the
 * floor for more than one.
 */
export function OutboxBannerView({
  count,
  places,
  why,
  href,
  placement = "app",
}: {
  count: number;
  places: readonly string[];
  why: "waits" | "asks" | "refused";
  href: string;
  placement?: "app" | "inline";
}) {
  const t = useTranslations("app.orders.outbox");
  return (
    <NoticeCard
      placement={placement}
      label={t("banner.label")}
      title={
        places.length > 0
          ? `${t("unsent", { count })} · ${t("places", { places: places.join(", ") })}`
          : t("unsent", { count })
      }
      line={
        why === "asks"
          ? t("banner.asks")
          : why === "refused"
            ? t("banner.refused")
            : t("banner.waits", { count })
      }
      action={
        <Button asChild variant="secondary" className="w-full md:w-auto">
          <Link href={href}>{t("banner.open")}</Link>
        </Button>
      }
    />
  );
}

/**
 * Where the page lands after the person's rounds were taken off the phone:
 * how many and where, why, and to pass them on by pad or word of mouth;
 * "הבנתי" lets it go.
 */
export function LostOrdersNoticeView({
  notice,
  onSeen,
  placement = "app",
  className,
}: {
  notice: LostNotice;
  onSeen: () => void;
  placement?: "app" | "inline";
  className?: string;
}) {
  const t = useTranslations("app.orders.outbox");
  return (
    <NoticeCard
      placement={placement}
      className={className}
      label={t("banner.label")}
      title={
        notice.places.length > 0
          ? `${t("unsent", { count: notice.count })} · ${t("places", { places: notice.places.join(", ") })}`
          : t("unsent", { count: notice.count })
      }
      line={t(`lost.${notice.why}`, { count: notice.count })}
      action={
        <Button
          variant="secondary"
          className="w-full md:w-auto"
          onClick={onSeen}
        >
          {t("lost.seen")}
        </Button>
      }
    />
  );
}

/**
 * The notice kept as the rounds went (`keepLostNotice`), read once on this
 * page, until "הבנתי". Nothing without one.
 */
export function LostOrdersNotice({
  placement = "app",
  className,
}: {
  placement?: "app" | "inline";
  className?: string;
}) {
  const [notice, setNotice] = useState<LostNotice | null>(null);
  useEffect(() => {
    try {
      const kept = lostSchema.safeParse(
        JSON.parse(sessionStorage.getItem(LOST_KEY) ?? "null"),
      );
      if (kept.success) setNotice(kept.data);
    } catch {
      // Blocked storage: nothing was kept.
    }
  }, []);
  if (!notice) return null;
  return (
    <LostOrdersNoticeView
      notice={notice}
      placement={placement}
      className={className}
      onSeen={() => {
        try {
          sessionStorage.removeItem(LOST_KEY);
        } catch {
          // Blocked storage: it goes with the page.
        }
        setNotice(null);
      }}
    />
  );
}
