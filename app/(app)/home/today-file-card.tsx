import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { ProgressRing } from "@ui/progress-ring";
import Link from "next/link";
import type { FileToday } from "../me/file/file-types";
import type { Translator } from "../wording";

/**
 * The person's own hiring file while something in it is missing (profile
 * H5b): how much, and "השלמת הפרטים", which opens it where they stopped.
 * When a fund still to choose is all a sent file lacks ("אבחר אחר כך"), it
 * says by when and "בחירת קרן פנסיה" opens the pension's step, since the
 * flow, with no step open, would open on its done screen; a file not sent
 * yet is sent from there, so the card keeps "השלמת הפרטים". The screen's one
 * accent card, with its one accent action, unless the owner's first steps
 * or an open mode hold it: then flat, and its action secondary. Never for
 * an owner, who isn't counted. Words at the start and the action at the
 * end, from a tablet up, as the mode's card.
 */
export function FileTodayCard({
  file,
  tone,
  t,
  day,
  href,
}: {
  file: FileToday;
  tone: "accent" | "flat";
  t: Translator<"app">;
  /** A `YYYY-MM-DD` day as Today says it ("24 בדצמבר"). */
  day: (date: string) => string;
  /** /me/file (its pension step when only a fund is left), or the twin's. */
  href: string;
}) {
  const pension = file.pension;
  return (
    <Card
      tone={tone}
      padding="lg"
      className="flex flex-col gap-4 md:max-w-2xl md:flex-row md:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ProgressRing value={file.asked - file.missing} max={file.asked} />
        <span className="flex min-w-0 flex-col">
          <CardTitle as="h2">
            {t("me.file.title", { business: file.businessName })}
          </CardTitle>
          {/* On the accent's light tint the words stay ink. */}
          <CardText
            className={cn("text-pretty", tone === "accent" && "text-ink")}
          >
            {pension?.kind === "open"
              ? t("me.file.pensionLeft", { date: day(pension.dueOn) })
              : t("me.file.missing", { count: file.missing })}
          </CardText>
        </span>
      </div>
      <Button
        asChild
        size="lg"
        variant={tone === "accent" ? "primary" : "secondary"}
        className="md:shrink-0"
      >
        <Link href={href}>
          {pension ? t("file.actions.choosePension") : t("me.file.complete")}
        </Link>
      </Button>
    </Card>
  );
}
