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
 * The screen's one accent card unless the owner's first steps or an open
 * mode hold it. Never for an owner, who isn't counted. Words at the start
 * and the action at the end, from a tablet up, as the mode's card.
 */
export function FileTodayCard({
  file,
  tone,
  t,
  href,
}: {
  file: FileToday;
  tone: "accent" | "flat";
  t: Translator<"app">;
  /** /me/file, or the twin's. */
  href: string;
}) {
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
            {t("me.file.missing", { count: file.missing })}
          </CardText>
        </span>
      </div>
      <Button asChild size="lg" className="md:shrink-0">
        <Link href={href}>{t("me.file.complete")}</Link>
      </Button>
    </Card>
  );
}
