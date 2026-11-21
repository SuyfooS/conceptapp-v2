"use client";

import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { CloudOff } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo, useSyncExternalStore } from "react";
import {
  forgetLostNotice,
  keptLostNotice,
  type LostNotice,
  lostNoticeOf,
  onLostNotice,
} from "./lost-notice";
import { type BannerLine, bannerLines } from "./outbox-banner";

/*
 * What waiter mode says outside its screens (P7): a banner above the app's
 * other screens while an order of the person's hasn't gone, and a notice,
 * once, where the page lands after their rounds were taken off the phone
 * (signed out, or no longer a member). Never a toast: the other screens
 * offer their own "ביטול" there. The views take their words as props, for
 * the twin and the gallery too.
 */

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
 * gone: how many and where, then what happens to them (`bannerLines`): those
 * waiting go by themselves once there is a connection, one past ten minutes
 * asks, and one refused is back in its draft, to open and send again; with
 * refused ones beside others, the line says which go by themselves and
 * which don't. "פתיחה" leads to its screen, or to the floor for more than one.
 */
export function OutboxBannerView({
  places,
  waiting,
  asking = 0,
  refused = 0,
  href,
  placement = "app",
}: {
  places: readonly string[];
  /** Rounds kept on the phone, waiting for a connection. */
  waiting: number;
  /** Rounds past ten minutes, asking. */
  asking?: number;
  /** Refusals back in their draft that no screen showed yet. */
  refused?: number;
  href: string;
  placement?: "app" | "inline";
}) {
  const t = useTranslations("app.orders.outbox");
  const count = waiting + asking + refused;
  const say = (line: BannerLine) => {
    switch (line.key) {
      case "waits":
        return t("banner.waits", { count: line.count });
      case "waitsSome":
        return t("banner.waitsSome", { count: line.count });
      case "asks":
        return t("banner.asks");
      case "refused":
        return t("banner.refused");
      case "refusedSome":
        return t("banner.refusedSome", { count: line.count });
    }
  };
  return (
    <NoticeCard
      placement={placement}
      label={t("banner.label")}
      title={
        places.length > 0
          ? `${t("unsent", { count })} · ${t("places", { places: places.join(", ") })}`
          : t("unsent", { count })
      }
      line={bannerLines({ waiting, asking, refused }).map(say).join(" ")}
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
 * "הבנתי" lets it go. Its own name, beside the banner's: both may show.
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
      label={t("lost.label")}
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
 * The notice kept as the rounds went (`keepLostNotice`), until "הבנתי":
 * read again whenever it is kept or let go, so it shows in the frame the
 * refresh kept as much as on a screen drawn afresh. Nothing without one.
 */
export function LostOrdersNotice({
  placement = "app",
  className,
}: {
  placement?: "app" | "inline";
  className?: string;
}) {
  const kept = useSyncExternalStore(onLostNotice, keptLostNotice, () => null);
  const notice = useMemo(() => lostNoticeOf(kept), [kept]);
  if (!notice) return null;
  return (
    <LostOrdersNoticeView
      notice={notice}
      placement={placement}
      className={className}
      onSeen={forgetLostNotice}
    />
  );
}
