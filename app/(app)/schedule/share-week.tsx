"use client";

import { scheduleWeekHref, weekRange } from "@domain/share";
import { Button } from "@ui/button";
import { DockButton, FloatingDock } from "@ui/floating-dock";
import { ShareSheet } from "@ui/share-sheet";
import { MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

/** What sharing a published week needs, beyond the week itself. */
export type ShareWeek = {
  /** The business's name, as the team knows it. */
  business: string;
  /** The schedule tab the link opens: "/schedule", or a twin's. */
  base: `/${string}`;
};

/**
 * Sharing a published week with the team (`ShareSheet`): the business's
 * name, the week in words and the link to that week on the schedule tab,
 * never who works when. In the builder's dock, once the week is out with
 * nothing new to publish (`dock`), or beside the tab's "פורסם ב-…" line
 * (`inline`), where it stays quiet so the tab keeps its one main action.
 */
export function ShareWeekButton({
  business,
  base,
  start,
  dates,
  range,
  kind,
  shape,
}: ShareWeek & {
  /** The week's first day, which the link names. */
  start: string;
  dates: readonly string[];
  /** The week in words, when the server already made it (the tab's eyebrow). */
  range?: string;
  /** "עודכן" after "פרסום השינויים" on this screen; "פורסם" otherwise. */
  kind: "changes" | "other";
  shape: "dock" | "inline";
}) {
  const t = useTranslations("app.shifts.share");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const label = t("action");
  const icon = <MessageCircle aria-hidden="true" />;
  return (
    <>
      {shape === "dock" ? (
        <FloatingDock>
          <DockButton icon={icon} onClick={() => setOpen(true)}>
            {label}
          </DockButton>
        </FloatingDock>
      ) : (
        <Button
          variant="secondary"
          onClick={() => setOpen(true)}
          className="self-start"
        >
          {icon}
          {label}
        </Button>
      )}
      <ShareSheet
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        message={t("text", {
          business,
          range: range ?? weekRange(locale, dates),
          kind,
        })}
        path={scheduleWeekHref(start, base)}
      />
    </>
  );
}
